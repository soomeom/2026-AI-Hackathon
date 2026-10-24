// 브라우저 → 로컬 서버 /api/ai 요청. 키는 서버에만 있고, 여기서는 상태·시간 제한·취소만 다룬다.
// requestAI(input, { signal, timeoutMs, fetchImpl }) -> Promise<AIResult>
// AIResult = { status:'ok', output, requestId, inputRevision } | { status:'failed'|'canceled', code, message, requestId }

export const AI_TIMEOUT_MS = 15000;

const FALLBACK_MESSAGE = {
  ai_timeout: 'AI 응답 시간이 초과되었어요. 직접 작성하거나 다시 시도해 주세요.',
  ai_unavailable: 'AI 서버에 연결하지 못했어요. 직접 작성은 계속할 수 있어요.',
  ai_canceled: 'AI 요청을 취소했어요.',
};

export async function requestAI(input, { signal, timeoutMs = AI_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const requestId = input.requestId ?? null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const relay = () => controller.abort();
  signal?.addEventListener('abort', relay, { once: true });
  try {
    const response = await fetchImpl('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    let body = null;
    try { body = await response.json(); } catch { /* 본문이 JSON 이 아니면 실패로 처리 */ }
    if (response.ok && body?.status === 'ok') {
      return { status: 'ok', output: body.output, requestId: body.requestId ?? requestId, inputRevision: body.inputRevision ?? null };
    }
    const code = body?.error?.code ?? 'ai_unavailable';
    return { status: 'failed', code, message: body?.error?.message ?? FALLBACK_MESSAGE.ai_unavailable, requestId };
  } catch {
    const code = timedOut ? 'ai_timeout' : signal?.aborted ? 'ai_canceled' : 'ai_unavailable';
    return { status: code === 'ai_canceled' ? 'canceled' : 'failed', code, message: FALLBACK_MESSAGE[code], requestId };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

export const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
