import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECTS, isSubjectEnabled } from '../public/src/content/subjects.js';
import { createDemoSession, DEMO_SESSION_KEY } from '../public/src/state/demo-session.js';
import { renderSubjectSelection } from '../public/src/ui/subject-selection.js';
import { createDemoState } from '../public/src/state/store.js';
import { STORAGE_KEY } from '../public/src/state/persistence.js';

const memory = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
};

test('only math is available and unsupported subjects cannot be selected', () => {
  assert.deepEqual(SUBJECTS.map(s => s.name), ['수학','국어','영어','사회','과학','한국사']);
  assert.deepEqual(SUBJECTS.filter(s => s.enabled).map(s => s.id), ['math']);
  const s = createDemoSession(memory());
  assert.throws(() => s.selectSubject('math'));
  s.enter('mentor');
  for (const id of ['english', 'unknown', null]) {
    assert.equal(isSubjectEnabled(id), false);
    assert.throws(() => s.selectSubject(id));
    assert.equal(s.subjectId, null);
  }
});

test('role-only sessions, corrupted subjects and missing roles restore to the right entry stage', () => {
  const storage = memory();
  for (const subjectId of [undefined, 'english', 'unknown', null]) {
    storage.setItem(DEMO_SESSION_KEY, JSON.stringify({ version:1, role:'learner', subjectId }));
    const s = createDemoSession(storage);
    assert.equal(s.role, 'learner'); assert.equal(s.subjectId, null);
  }
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify({ version:1, role:'admin', subjectId:'math' }));
  assert.equal(createDemoSession(storage).role, null);
  assert.equal(createDemoSession(storage).subjectId, null);
});

test('subject restoration, return and role changes never modify learning storage', () => {
  const storage = memory();
  const saved = JSON.stringify(createDemoState()); storage.setItem(STORAGE_KEY, saved);
  const s = createDemoSession(storage);
  s.enter('learner'); s.selectSubject('math');
  assert.equal(createDemoSession(storage).subjectId, 'math');
  s.clearSubject();
  assert.equal(s.role, 'learner'); assert.equal(createDemoSession(storage).subjectId, null);
  s.selectSubject('math'); s.enter('mentor'); assert.equal(s.subjectId, null);
  s.selectSubject('math'); s.leave();
  assert.equal(s.subjectId, null); assert.equal(s.role, null);
  assert.equal(storage.getItem(STORAGE_KEY), saved);
});

test('blocked storage still supports math selection and leaving in memory', () => {
  for (const storage of [null, {getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}}]) {
    const s = createDemoSession(storage); s.enter('learner'); s.selectSubject('math');
    assert.equal(s.subjectId, 'math'); assert.equal(s.persistent, false);
    s.clearSubject(); assert.equal(s.subjectId, null); s.leave(); assert.equal(s.role, null);
  }
});

test('subject screen exposes one action, explains unavailable subjects and rejects fabricated clicks', () => {
  for (const role of ['mentor','learner']) {
    const root = { innerHTML:'' }, selected = [];
    renderSubjectSelection({ root, state:createDemoState(), role, onSelect:id=>selected.push(id) });
    assert.equal((root.innerHTML.match(/<button/g) ?? []).length, 1);
    assert.equal((root.innerHTML.match(/준비 중/g) ?? []).length, 5);
    assert.match(root.innerHTML, role === 'mentor' ? /수학 지도 시작/ : /수학 학습 시작/);
    for (const subjectId of ['english','unknown','math']) root.onclick({target:{closest:()=>({dataset:{subjectId}})}});
    assert.deepEqual(selected,['math']);
  }
});

test('guardians skip subject selection: entering, restoring and returning keep the learner subject', () => {
  const storage = memory();
  const s = createDemoSession(storage);
  s.enter('guardian');
  assert.equal(s.subjectId, 'math');
  s.clearSubject();
  assert.equal(s.subjectId, 'math');
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify({ version:1, role:'guardian', subjectId:null }));
  assert.equal(createDemoSession(storage).subjectId, 'math');
  s.enter('learner');
  assert.equal(s.subjectId, null);
});
