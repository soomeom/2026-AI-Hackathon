import { esc } from './text.js';
import { SIGNUP_ROLES, GANGWON_REGIONS, SIGNUP_AGE_BANDS } from '../auth/signup.js';

// validateSignup 오류 키 -> 포커스할 칸. 역할은 입력 칸이 아니라 첫 선택 버튼으로 보낸다.
export const SIGNUP_FOCUS = {
  name: '#signup-name', loginId: '#signup-login-id', password: '#signup-password', passwordConfirm: '#signup-password-confirm',
  role: '[data-signup-role]', region: '#signup-region', ageBand: '#signup-age', linkCode: '#signup-link-code',
  agree: '#signup-agree', guardianAgree: '#signup-guardian-agree'
};

const errorAttrs = (id, errors, key) => errors[key] ? ` aria-invalid="true" aria-describedby="${id}-error"` : '';
const errorText = (id, errors, key, extra = '') => {
  const text = errors[key] || extra;
  return text ? `<p id="${id}-error" class="field-error" role="alert">${esc(text)}</p>` : '';
};
const options = (list, value, placeholder) => `<option value="">${placeholder}</option>` + list.map(item => {
  const [id, label] = Array.isArray(item) ? item : [item, item];
  return `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');

function textField(id, label, key, values, errors, { type = 'text', autocomplete = 'off', extra = '', hint = '', notice = '', required = false } = {}) {
  const value = type === 'password' ? '' : ` value="${esc(values[key] ?? '')}"`;
  const describedBy = [errors[key] || notice ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ');
  const invalid = errors[key] ? ' aria-invalid="true"' : '';
  return `<div class="auth-field">
      <label for="${id}">${label}</label>
      ${hint ? `<p id="${id}-hint" class="field-hint small muted">${hint}</p>` : ''}
      <input id="${id}" name="${key}" type="${type}" autocomplete="${autocomplete}" autocapitalize="none" spellcheck="false"${value}${extra}${invalid}${required ? ' aria-required="true"' : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}>
      ${errorText(id, errors, key, notice)}
    </div>`;
}

function selectField(id, label, key, list, values, errors, placeholder, extra = '') {
  return `<div class="auth-field">
      <label for="${id}">${label}</label>
      <select id="${id}" name="${key}"${extra}${errorAttrs(id, errors, key)}>${options(list, values[key], placeholder)}</select>
      ${errorText(id, errors, key)}
    </div>`;
}

function checkField(id, label, key, values, errors) {
  return `<div class="auth-check">
      <label for="${id}"><input id="${id}" type="checkbox"${values[key] ? ' checked' : ''}${errorAttrs(id, errors, key)}> <span>${label}</span></label>
      ${errorText(id, errors, key)}
    </div>`;
}

export function renderSignupForm(values = {}, errors = {}, { passwordNotice = '' } = {}) {
  const roleButtons = SIGNUP_ROLES.map(([id, label]) =>
    `<button type="button" class="secondary" data-signup-role="${id}" aria-pressed="${values.role === id}">${label}</button>`).join('');
  return `<section class="auth-card signup-card" aria-labelledby="signup-title">
      <h2 id="signup-title">배움길 회원가입</h2>
      <p class="muted small">이름은 가명으로 적어도 괜찮아요.</p>
      <form id="signup-form" novalidate>
        <div class="auth-field" role="group" aria-labelledby="signup-role-label">
          <span id="signup-role-label" class="field-label">역할</span>
          <div class="signup-roles">${roleButtons}</div>
          ${errorText('signup-role', errors, 'role')}
        </div>
        ${textField('signup-name', '이름(가명)', 'name', values, errors, { autocomplete: 'nickname', extra: ' maxlength="20"' })}
        ${selectField('signup-age', '연령대', 'ageBand', SIGNUP_AGE_BANDS, values, errors, '연령대를 골라 주세요', ' data-signup-age')}
        ${selectField('signup-region', '사는 지역', 'region', GANGWON_REGIONS, values, errors, '지역을 골라 주세요')}
        ${textField('signup-login-id', '아이디', 'loginId', values, errors, { autocomplete: 'username', hint: '영문 소문자와 숫자 4~16자' })}
        ${textField('signup-password', '비밀번호', 'password', values, errors, { type: 'password', autocomplete: 'new-password', hint: '영문과 숫자를 섞어 8~32자', notice: passwordNotice })}
        ${textField('signup-password-confirm', '비밀번호 확인', 'passwordConfirm', values, errors, { type: 'password', autocomplete: 'new-password' })}
        ${textField('signup-link-code', '연결 코드 (보호자는 필수)', 'linkCode', values, errors, { hint: '멘토·학생·보호자를 서로 연결하는 코드예요. 센터나 멘토에게 받아요. 프로토타입에서는 실제로 연결되지 않아요.', required: values.role === 'guardian' })}
        ${checkField('signup-agree', '개인정보 수집·이용 동의 (필수)', 'agree', values, errors)}
        ${values.ageBand === 'under14' ? checkField('signup-guardian-agree', '보호자 동의 (14세 미만 필수)', 'guardianAgree', values, errors) : ''}
        <button type="submit" class="primary large" data-auth-action="signup-submit">가입하기</button>
      </form>
      <button type="button" class="secondary" data-auth-action="login-view">로그인으로 돌아가기</button>
    </section>`;
}

export function renderSignupDone() {
  return `<section id="signup-done" class="auth-card" aria-labelledby="signup-done-title">
      <h2 id="signup-done-title">가입 신청 화면을 확인했어요</h2>
      <p>프로토타입이라 실제 계정은 만들어지지 않았어요. 시연 계정으로 로그인해 주세요.</p>
      <button type="button" class="primary large" data-auth-action="login-view">로그인 화면으로</button>
    </section>`;
}

export function readSignupForm(root, role) {
  const q = selector => root.querySelector?.(selector);
  const text = id => q(id)?.value ?? '';
  return {
    name: text('#signup-name'), loginId: text('#signup-login-id'), password: text('#signup-password'),
    passwordConfirm: text('#signup-password-confirm'), role, region: text('#signup-region'), ageBand: text('#signup-age'),
    linkCode: text('#signup-link-code'), agree: Boolean(q('#signup-agree')?.checked), guardianAgree: Boolean(q('#signup-guardian-agree')?.checked)
  };
}
