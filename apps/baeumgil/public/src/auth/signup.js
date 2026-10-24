import { isReservedLoginId } from './accounts.js';

export const SIGNUP_ROLES = [['learner','멘티(학생)'],['mentor','멘토'],['guardian','보호자']];
export const GANGWON_REGIONS = ['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군','강원 외 지역'];
export const SIGNUP_AGE_BANDS = [['under14','14세 미만'],['teen','14~19세'],['adult','20~59세'],['senior','60세 이상']];

export const normalizeLinkCode = (code) => String(code ?? '').trim().toUpperCase();

const str = (v) => (typeof v === 'string' ? v : '');
const inList = (list, v) => list.some(([key]) => key === v);

export function validateSignup(form = {}) {
  const errors = {};
  const name = str(form.name).trim();
  if (name.length < 1 || name.length > 20) errors.name = '이름(가명)을 1~20자로 입력해 주세요.';

  const loginId = str(form.loginId).trim().toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(loginId)) errors.loginId = '아이디는 영문 소문자와 숫자 4~16자예요.';
  else if (isReservedLoginId(loginId)) errors.loginId = '이미 사용 중인 아이디예요.';

  const password = str(form.password);
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/.test(password)) errors.password = '비밀번호는 영문과 숫자를 섞어 8~32자로 만들어 주세요.';
  if (password !== str(form.passwordConfirm)) errors.passwordConfirm = '비밀번호가 서로 달라요.';

  if (!inList(SIGNUP_ROLES, form.role)) errors.role = '역할을 골라 주세요.';
  if (!GANGWON_REGIONS.includes(form.region)) errors.region = '사는 지역을 골라 주세요.';
  if (!inList(SIGNUP_AGE_BANDS, form.ageBand)) errors.ageBand = '연령대를 골라 주세요.';

  const linkCode = normalizeLinkCode(form.linkCode);
  if (linkCode && !/^BG-[A-Z0-9]{4}$/.test(linkCode)) errors.linkCode = '연결 코드는 BG-1234 형식이에요.';
  else if (!linkCode && form.role === 'guardian') errors.linkCode = '자녀의 연결 코드를 입력해 주세요.';

  if (form.agree !== true) errors.agree = '개인정보 수집·이용에 동의해 주세요.';
  if (form.role === 'learner' && form.ageBand === 'under14' && form.guardianAgree !== true) errors.guardianAgree = '14세 미만은 보호자 동의가 필요해요.';

  return { ok: Object.keys(errors).length === 0, errors };
}
