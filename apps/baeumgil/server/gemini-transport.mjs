export class AIProviderError extends Error {
  constructor(code, status = 502) { super(code); this.name = 'AIProviderError'; this.code = code; this.status = status; }
}

/** 공급자가 AbortSignal을 무시해도 서버 대기를 끝낸다. 자동 재시도는 하지 않는다. */
export async function withDeadline(operation, { signal, timeoutMs = 15000 } = {}) {
  if (signal?.aborted) throw new AIProviderError('ai_canceled', 499);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  controller.signal.addEventListener('abort', () => rejectAbort(new AIProviderError(timedOut ? 'ai_timeout' : 'ai_canceled', timedOut ? 504 : 499)), { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), aborted]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function createGeminiTransport({ apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '', model = process.env.GEMINI_MODEL ?? '', fetchImpl = globalThis.fetch } = {}) {
  const configured=Boolean(apiKey && /^[A-Za-z0-9._-]+$/.test(model));
  return {configured,model:model||null,async generate(body,{signal}={}) {
    if(!configured)throw new AIProviderError('ai_not_configured',503);
    try {
      const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body),signal});
      if(!response.ok)throw new AIProviderError(response.status===429?'ai_rate_limited':'ai_unavailable',response.status===429?429:502);
      const data=await response.json(),candidate=data.candidates?.[0];
      if(!candidate)throw new AIProviderError('ai_blocked');
      if(candidate.finishReason&&candidate.finishReason!=='STOP')throw new AIProviderError('ai_incomplete');
      return {text:(candidate.content?.parts??[]).filter(p=>p.thought!==true).map(p=>p.text??'').join(''),model};
    }catch(e){if(e instanceof AIProviderError)throw e;throw new AIProviderError('ai_unavailable');}
  }};
}
