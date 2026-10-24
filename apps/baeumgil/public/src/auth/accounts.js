// 시연용 공개 계정이다. 실제 인증이 아니며 비밀번호는 화면에 그대로 보여 준다.
export const DEMO_ACCOUNTS = Object.freeze([
  Object.freeze({ loginId: 'mentor01', password: 'mentor1234', role: 'mentor', label: '멘토' }),
  Object.freeze({ loginId: 'learner01', password: 'learner1234', role: 'learner', label: '멘티' }),
  Object.freeze({ loginId: 'parent01', password: 'parent1234', role: 'guardian', label: '보호자' }),
]);

const normalizeId = (id) => id.trim().toLowerCase();

export function authenticate(loginId, password) {
  if (typeof loginId !== 'string' || typeof password !== 'string' || !loginId.trim() || !password) return { ok: false, reason: 'empty' };
  const id = normalizeId(loginId);
  const account = DEMO_ACCOUNTS.find((a) => a.loginId === id && a.password === password);
  return account ? { ok: true, role: account.role } : { ok: false, reason: 'mismatch' };
}

export function isReservedLoginId(loginId) {
  return typeof loginId === 'string' && DEMO_ACCOUNTS.some((a) => a.loginId === normalizeId(loginId));
}
