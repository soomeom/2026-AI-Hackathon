// 시연용 화면 입장 상태만 관리한다. 학습 기록 저장소나 실제 인증과는 별개다.
export const DEMO_SESSION_KEY = 'baeumgil:demo-session:v1';
const validRole = role => role === 'mentor' || role === 'learner';

export function createDemoSession(storage) {
  let role = null;
  let persistent = Boolean(storage);
  let raw;
  try { raw = storage?.getItem(DEMO_SESSION_KEY); } catch { persistent = false; }
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (saved?.version === 1 && validRole(saved.role)) role = saved.role;
  } catch { /* 손상된 입장 정보는 사용하지 않는다. 학습 기록은 건드리지 않는다. */ }

  return {
    get role() { return role; },
    get persistent() { return persistent; },
    enter(nextRole) {
      if (!validRole(nextRole)) throw new Error('invalid_demo_role');
      role = nextRole;
      try { storage?.setItem(DEMO_SESSION_KEY, JSON.stringify({ version: 1, role })); }
      catch { persistent = false; }
    },
    leave() {
      role = null;
      try { storage?.removeItem(DEMO_SESSION_KEY); }
      catch { persistent = false; }
    },
  };
}

// 기록·초안은 유지하고, 입장할 화면의 위치만 선택한다.
export function prepareDemoRole(ui, state, role) {
  if (!validRole(role)) throw new Error('invalid_demo_role');
  Object.assign(ui, { role, flash: null, confirmReset: false, initialAssessmentOpen: false });
  if (role === 'mentor') {
    ui.mentorTab = 'home';
    return;
  }
  const paths = (state.paths ?? []).filter(path => path.learnerId === state.learnerId);
  const path = paths.find(path => path.status === 'active' || path.status === 'paused') ?? paths.at(-1);
  ui.learnerPathId = path?.id ?? null;
  ui.initialAssessmentDismissed = Boolean(path);
}

export function cancelPendingDemoAI(ui) {
  for (const [key, slot] of Object.entries(ui.ai ?? {})) {
    if (slot?.status !== 'loading') continue;
    slot.controller?.abort();
    // 공급자가 취소를 무시해도 runAI의 requestId 비교에서 늦은 응답을 버린다.
    ui.ai[key] = { status: 'canceled', requestId: null, message: '역할을 바꾸어 AI 요청을 멈췄어요. 다시 요청할 수 있어요.' };
  }
}
