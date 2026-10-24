// AI 수업 제안·일지 문장 공통 처리: 요청 상태, 늦은 응답 차단, 결과 기록(aiArtifacts), 멘토의 채택 결정.
// AI 결과는 자동으로 과제·평가·일지에 반영하지 않는다. 멘토가 고른다.
import { requestAI, newRequestId } from '../ai/client.js';
import { validateAIOutput } from '../ai/contracts.js';
import { esc } from './text.js';

// 학습 기록이 바뀌었는지 판단하는 기준 (AI 기록 저장 같은 변경은 제외)
export const learningBasis = (state, sessionId) => {
  const session = (state.sessions ?? []).find((s) => s.id === sessionId);
  return JSON.stringify([(state.attempts ?? []).length, session?.version ?? null]);
};

export function aiAvailability(ui) {
  if (!ui.health?.reachable) return { ok: false, text: '로컬 서버(npm run dev)로 열어야 AI를 쓸 수 있어요.' };
  if (!ui.health.aiConfigured) return { ok: false, text: '서버에 AI 키·모델이 설정되지 않았어요 (.env). 직접 작성은 계속할 수 있어요.' };
  return { ok: true, text: `AI 연결됨 · ${ui.health.model ?? ''}` };
}

export async function runAI({ key, kind, buildInput, ctx }) {
  const { ui } = ctx;
  ui.ai[key]?.controller?.abort();
  const requestId = newRequestId();
  const controller = new AbortController();
  const state = ctx.getState();
  const input = buildInput(state, requestId);
  const basis = learningBasis(state, input.sessionId);
  ui.ai[key] = { status: 'loading', requestId, basis, controller };
  ctx.rerender();

  const result = await requestAI(input, { signal: controller.signal });
  if (ui.ai[key]?.requestId !== requestId) return; // 더 새 요청이 있으면 이 응답은 버린다

  if (result.status !== 'ok') {
    ui.ai[key] = { status: result.status, message: result.message, requestId };
    ctx.rerender();
    return;
  }
  const check = validateAIOutput(input, result.output);
  if (!check.ok) {
    ui.ai[key] = { status: 'failed', message: '근거를 확인할 수 없는 AI 응답이라 쓰지 않았어요. 직접 작성해 주세요.', requestId };
    ctx.rerender();
    return;
  }
  const artifactId = `ai-${requestId}`;
  ctx.update((s) => ({
    ...s,
    aiArtifacts: [...(s.aiArtifacts ?? []), {
      id: artifactId, kind, requestId, sessionId: input.sessionId ?? null, inputRevision: input.inputRevision,
      contractVersion: input.contractVersion, evidenceIds: input.allowedEvidenceIds, output: check.value,
      source: 'live', decision: null, createdAt: new Date().toISOString(),
    }],
  }), { type: 'aiArtifactSaved', artifactId });
  ui.ai[key] = { status: 'ok', output: check.value, requestId, basis, artifactId };
  ctx.rerender();
}

export function cancelAI(key, ui) {
  ui.ai[key]?.controller?.abort();
}

export function decideAI(artifactId, decision, ctx) {
  ctx.update((s) => ({
    ...s,
    aiArtifacts: (s.aiArtifacts ?? []).map((a) => (a.id === artifactId ? { ...a, decision, decidedAt: new Date().toISOString() } : a)),
  }), { type: 'aiDecision', artifactId, decision });
}

// 요청 상태 표시 (진행 중·실패·이전 기록 기준)
export function statusHtml(slot, state, sessionId) {
  if (!slot) return '';
  if (slot.status === 'loading') {
    return `<div class="msg" role="status">AI가 근거를 정리하고 있어요… (최대 15초)
      <div class="row"><button class="ghost" data-ai="cancel">취소</button></div></div>`;
  }
  if (slot.status === 'failed' || slot.status === 'canceled') {
    return `<div class="msg warn" role="alert">${esc(slot.message)}</div>`;
  }
  if (slot.status === 'ok' && slot.basis !== learningBasis(state, sessionId)) {
    return '<div class="msg warn">이 제안 이후 학습 기록이 바뀌었어요. ‘이전 기록 기준’ 제안이에요. 다시 요청할 수 있어요.</div>';
  }
  return '';
}

export function decisionHtml(state, artifactId) {
  const artifact = (state.aiArtifacts ?? []).find((a) => a.id === artifactId);
  if (!artifact) return '';
  if (artifact.decision) {
    return `<p class="muted">멘토 결정: <b>${artifact.decision === 'adopted' ? '채택' : '채택하지 않음'}</b></p>`;
  }
  return `<div class="row"><button data-ai="adopt" data-artifact="${esc(artifactId)}">채택</button>
    <button class="ghost" data-ai="reject" data-artifact="${esc(artifactId)}">채택하지 않음</button></div>`;
}
