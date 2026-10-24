// Google Gemini 공급자 어댑터 (담당: 지훈)
// 요청 본문은 ai/contracts.js의 buildGeminiRequest가 만든 generateContent 본문을 그대로 보낸다.
// 다른 공급자로 바꿀 때는 같은 generate() 형식을 가진 어댑터를 새로 만들면 된다.

import { ERROR_CODES } from '../../public/src/domain/contracts.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export class ProviderError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export function createGeminiProvider({ apiKey, model = DEFAULT_GEMINI_MODEL, fetchImpl = globalThis.fetch }) {
  return {
    name: 'gemini',
    model,
    async generate({ request, signal }) {
      let response;
      try {
        response = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          // 키는 URL이 아니라 헤더로 보낸다 (로그에 남지 않게)
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        throw new ProviderError(ERROR_CODES.AI_PROVIDER_ERROR, 'Gemini 요청을 보내지 못했어요', { cause: error });
      }

      if (response.status === 429) {
        throw new ProviderError(ERROR_CODES.AI_RATE_LIMITED, 'Gemini 호출 한도 초과', { status: 429 });
      }
      if (!response.ok) {
        // 모델 이름·스키마 오류 등은 Gemini가 본문에 이유를 적어 준다 (서버 로그 확인용)
        const reason = await readErrorReason(response);
        throw new ProviderError(ERROR_CODES.AI_PROVIDER_ERROR, `Gemini HTTP ${response.status}${reason ? `: ${reason}` : ''}`, {
          status: response.status,
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        throw new ProviderError(ERROR_CODES.AI_PROVIDER_ERROR, 'Gemini 응답을 읽지 못했어요', { cause: error });
      }

      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('');
      if (text === '') {
        const reason = data?.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'EMPTY';
        throw new ProviderError(ERROR_CODES.AI_PROVIDER_ERROR, `Gemini가 빈 응답을 보냈어요 (${reason})`);
      }
      return { text, model: data.modelVersion ?? model };
    },
  };
}

async function readErrorReason(response) {
  try {
    const data = await response.json();
    return String(data?.error?.message ?? '').slice(0, 300);
  } catch {
    return '';
  }
}
