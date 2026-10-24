import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ACCOUNTS, authenticate, isReservedLoginId } from '../public/src/auth/accounts.js';
import { SIGNUP_ROLES, GANGWON_REGIONS, SIGNUP_AGE_BANDS, validateSignup, normalizeLinkCode } from '../public/src/auth/signup.js';

test('demo accounts log in by role; ids ignore case and outer spaces, passwords do not', () => {
  assert.deepEqual(DEMO_ACCOUNTS.map(a => [a.loginId, a.role]), [['mentor01','mentor'],['learner01','learner'],['parent01','guardian']]);
  assert.deepEqual(authenticate('mentor01', 'mentor1234'), { ok: true, role: 'mentor' });
  assert.deepEqual(authenticate(' Parent01 ', 'parent1234'), { ok: true, role: 'guardian' });
  assert.deepEqual(authenticate('learner01', ' learner1234'), { ok: false, reason: 'mismatch' });
  assert.deepEqual(authenticate('learner01', 'mentor1234'), { ok: false, reason: 'mismatch' });
  assert.deepEqual(authenticate('nobody', 'x'), { ok: false, reason: 'mismatch' });
  for (const [id, pw] of [['', 'a'], ['   ', 'a'], ['mentor01', ''], [null, undefined]]) assert.equal(authenticate(id, pw).reason, 'empty');
  assert.equal(Object.isFrozen(DEMO_ACCOUNTS[0]), true);
  assert.equal(isReservedLoginId('MENTOR01'), true);
});

const valid = { name:'하늘', loginId:'sky2026', password:'abc12345', passwordConfirm:'abc12345', role:'learner', region:'춘천시', ageBand:'teen', linkCode:'', agree:true, guardianAgree:false };
test('signup validation accepts a complete form and reports each rule with its exact message', () => {
  assert.deepEqual(validateSignup(valid), { ok: true, errors: {} });
  const bad = validateSignup({ ...valid, name:' ', loginId:'Mentor01', password:'abcdefgh', passwordConfirm:'x', role:'admin', region:'서울', ageBand:'', linkCode:'bg-12', agree:false });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors), ['name','loginId','password','passwordConfirm','role','region','ageBand','linkCode','agree']);
  assert.equal(bad.errors.loginId, '이미 사용 중인 아이디예요.');
  assert.equal(validateSignup({ ...valid, role:'guardian' }).errors.linkCode, '자녀의 연결 코드를 입력해 주세요.');
  assert.equal(validateSignup({ ...valid, role:'guardian', linkCode:' bg-a1b2 ' }).ok, true);
  assert.equal(validateSignup({ ...valid, ageBand:'under14' }).errors.guardianAgree, '14세 미만은 보호자 동의가 필요해요.');
  assert.equal(validateSignup({ ...valid, ageBand:'under14', guardianAgree:true }).ok, true);
  assert.equal(validateSignup({ ...valid, role:'guardian', ageBand:'under14', linkCode:'BG-1234' }).ok, true);
  assert.equal(validateSignup({ ...valid, role:'mentor', ageBand:'under14' }).errors.guardianAgree, undefined);
  assert.equal(validateSignup({ ...valid, password:'12345678', passwordConfirm:'12345678' }).errors.password, '비밀번호는 영문과 숫자를 섞어 8~32자로 만들어 주세요.');
});
