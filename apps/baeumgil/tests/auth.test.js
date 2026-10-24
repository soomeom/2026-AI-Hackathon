import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ACCOUNTS, authenticate, isReservedLoginId } from '../public/src/auth/accounts.js';

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
