// POST /api/ai 처리 (담당: 지훈, PRD 10절)
// 화면은 다은·수영님 ai/contracts.js의 buildAIInput 결과(input)를 보낸다.
// 서버는 같은 모듈의 buildGeminiRequest로 Gemini 본문을 만들고, validateAIOutput을 통과한 결과만 돌려준다.
// 서버가 하는 일: 형식 검사, 15초 제한, 공급자 호출, 오류 분류.

import { AI_CONTRACT_VERSION, AI_KINDS, buildGeminiRequest, validateAIOutput } from '../../public/src/ai/contracts.js';
import { ERROR_CODES, fail, succeed } from '../../public/src/domain/contracts.js';

export const AI_TIMEOUT_MS = 15_000;
const MAX_ID_CHARS = 200;
const ALLOWED_ID_FIELDS = ['allowedConceptIds', 'allowedEvidenceIds', 'allowedQuestionIds'];

const STATUS_BY_CODE = {
  [ERROR_CODES.INVALID_REQUEST]: 400,
  [ERROR_CODES.AI_NOT_CONFIGURED]: 503,
  [ERROR_CODES.AI_TIMEOUT]: 504,
  [ERROR_CODES.AI_RATE_LIMITED]: 429,
  [ERROR_CODES.AI_PROVIDER_ERROR]: 502,
  [ERROR_CODES.AI_INVALID_OUTPUT]: 502,
  [ERROR_CODES.AI_CANCELED]: 499,
};

// 재시도하면 나아질 수 있는 실패인지 화면에 알려 준다
const RETRYABLE = new Set([
  ERROR_CODES.AI_TIMEOUT,
  ERROR_CODES.AI_RATE_LIMITED,
  ERROR_CODES.AI_PROVIDER_ERROR,
  ERROR_CODES.AI_INVALID_OUTPUT,
]);

export function parseAiRequest(body) {
  if (!isPlainObject(body)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'body' });
  }
  const { requestId, inputVersion = null, input } = body;
  if (!isBoundedString(requestId)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'requestId' });
  }
  if (inputVersion !== null && !isBoundedString(inputVersion)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'inputVersion' });
  }
  if (!isPlainObject(input)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'input' });
  }
  if (input.contractVersion !== AI_CONTRACT_VERSION) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'input.contractVersion' });
  }
  if (!AI_KINDS.includes(input.kind)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'input.kind' });
  }
  for (const field of ALLOWED_ID_FIELDS) {
    if (!Array.isArray(input[field]) || !input[field].every((id) => typeof id === 'string')) {
      return fail(ERROR_CODES.INVALID_REQUEST, { field: `input.${field}` });
    }
  }
  if (!isPlainObject(input.constraints)) {
    return fail(ERROR_CODES.INVALID_REQUEST, { field: 'input.constraints' });
  }
  return succeed({ requestId, inputVersion, input });
}

/**
 * @param {object} options
 * @param {{ name: string, model: string, generate: Function } | null} options.provider 키가 없으면 null
 * @param {(input: object) => object} [options.buildRequest] Gemini 본문 생성. 실험 도구(ai:lab)만 바꾸고 서버는 팀 기본값을 쓴다
 * @returns {(body: unknown, context?: { signal?: AbortSignal }) => Promise<{ status: number, payload: object }>}
 */
export function createAiHandler({
  provider,
  buildRequest = buildGeminiRequest,
  timeoutMs = AI_TIMEOUT_MS,
  now = () => new Date(),
  log = () => {},
}) {
  return async function handleAiRequest(body, { signal: clientSignal } = {}) {
    const parsed = parseAiRequest(body);
    if (!parsed.ok) {
      const echo = { requestId: body?.requestId ?? null, inputVersion: body?.inputVersion ?? null, kind: body?.input?.kind ?? null };
      return failure(echo, parsed.error);
    }
    const { requestId, inputVersion, input } = parsed.value;
    // 늦게 도착한 이전 요청을 화면이 걸러낼 수 있도록 요청 ID와 입력 버전을 그대로 돌려준다 (AC-10)
    const echo = { requestId, inputVersion, kind: input.kind };
    if (!provider) {
      return failure(echo, fail(ERROR_CODES.AI_NOT_CONFIGURED).error);
    }

    const startedAt = Date.now();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = clientSignal ? AbortSignal.any([timeoutSignal, clientSignal]) : timeoutSignal;
    let outcome = 'ok';
    let detail;
    try {
      // 시스템 지시는 kind와 메모 유무로만 정해지므로 화면이 프롬프트를 바꿀 수 없다
      const result = await provider.generate({ request: buildRequest(input), signal });

      // 허용 ID 밖 참조, 필수 필드 누락, 단정적·정서 표현이 있으면 채택하지 않는다 (AC-09)
      const verdict = validateAIOutput(input, result.text);
      if (!verdict.ok) {
        outcome = ERROR_CODES.AI_INVALID_OUTPUT;
        return failure(echo, fail(ERROR_CODES.AI_INVALID_OUTPUT, { errors: verdict.errors }).error);
      }

      return {
        status: 200,
        payload: {
          ok: true,
          ...echo,
          source: 'live_ai',
          provider: provider.name,
          model: result.model,
          output: verdict.value,
          completedAt: now().toISOString(),
        },
      };
    } catch (error) {
      const code = classifyError(error, { timeoutSignal, clientSignal });
      outcome = code;
      // 원인 문구(HTTP 상태, Gemini 오류 이유)는 서버 로그에만 남기고 화면에는 보내지 않는다
      detail = typeof error?.message === 'string' ? error.message.slice(0, 300) : undefined;
      return failure(echo, fail(code).error);
    } finally {
      // 입력에는 학생 기록이 들어 있으므로 내용은 남기지 않는다
      log({ requestId, kind: input.kind, outcome, ms: Date.now() - startedAt, ...(detail ? { detail } : {}) });
    }
  };
}

function classifyError(error, { timeoutSignal, clientSignal }) {
  if (timeoutSignal.aborted) {
    return ERROR_CODES.AI_TIMEOUT;
  }
  if (clientSignal?.aborted) {
    return ERROR_CODES.AI_CANCELED;
  }
  if (typeof error?.code === 'string' && error.code in STATUS_BY_CODE) {
    return error.code;
  }
  return ERROR_CODES.AI_PROVIDER_ERROR;
}

function failure(echo, error) {
  return {
    status: STATUS_BY_CODE[error.code] ?? 500,
    payload: { ok: false, ...echo, error: { ...error, retryable: RETRYABLE.has(error.code) } },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_ID_CHARS;
}
