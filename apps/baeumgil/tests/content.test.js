import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, listAssignableQuestions } from '../public/src/content/catalog.js';
import { IDS, makeCatalog, makeQuestion, makeState, command, runCommands } from './fixtures.js';

const assignableIds = (catalog) => listAssignableQuestions(catalog).map((q) => q.id);
const codes = (result) => result.errors.map((e) => e.code);
const routeOf = (catalog, questionId) => catalog.routes.find((r) => r.questionId === questionId);

test('기본 카탈로그는 오류 없이 통과하고 대표 문항 2개를 출제할 수 있다', () => {
  const catalog = makeCatalog();
  const result = validateCatalog(catalog);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.deepEqual(assignableIds(catalog), ['q-eq-1', 'q-rat-1']);
});

test('대표 문항은 고졸 출제 범위의 중학 기초 개념을 보충하는 자체 제작 문항으로 표기된다', () => {
  // 2026 출제 계획: 고졸 수학은 2015 개정 고등학교 '수학'에서 출제, 고졸은 기출 재출제 미적용.
  // 일차방정식·유리수 계산은 중1 개념이므로 고졸 출제 유형처럼 표기하지 않는다.
  const catalog = makeCatalog();
  for (const q of catalog.questions.filter((x) => x.role === 'original' || x.role === 'transfer_spare')) {
    const { questionType, note = '' } = q.reference;
    assert.match(questionType, /기초/, q.id);
    assert.match(questionType, /중1/, q.id);
    assert.doesNotMatch(`${questionType} ${note}`, /출제 유형|기출 원문/, q.id);
  }
  for (const id of ['q-eq-1', 'q-rat-1']) {
    const { note } = catalog.questions.find((x) => x.id === id).reference;
    assert.match(note, /고등학교 '수학'/);
    assert.match(note, /실제 검정고시 문항이 아니다/);
  }
});

test('대표 문항은 자체 제작 문항이며 허위 연도·회차 메타데이터가 없다', () => {
  const catalog = makeCatalog();
  for (const id of ['q-eq-1', 'q-rat-1']) {
    const q = catalog.questions.find((x) => x.id === id);
    assert.equal(q.kind, 'authored');
    assert.equal(q.contentStatus, 'approved');
    assert.equal(q.role, 'original');
    assert.equal(typeof q.reference.questionType, 'string');
    assert.equal(q.reference.authored, true);
    for (const key of ['year', 'round', 'session', 'examDate', 'examYear']) {
      assert.equal(key in q, false, `${id}.${key}`);
      assert.equal(key in q.reference, false, `${id}.reference.${key}`);
    }
    assert.doesNotMatch(JSON.stringify(q), /\d{4}\s*년|회차|제\s*\d+\s*회/);
  }
});

test('대표 문항마다 개념·개념 확인·틀 ID·예비 문항이 연결된 보충 경로가 있다', () => {
  const catalog = makeCatalog();
  for (const id of ['q-eq-1', 'q-rat-1']) {
    const route = routeOf(catalog, id);
    assert.ok(route, `${id} route`);
    assert.ok(catalog.concepts.some((c) => c.id === route.coreConceptId));
    assert.ok(route.prerequisiteConceptIds.length > 0);
    assert.ok(route.conceptCheckQuestionIds.length >= 1 && route.conceptCheckQuestionIds.length <= 2);
    for (const key of ['foundationTemplateId', 'similarTemplateId', 'transferTemplateId']) {
      assert.ok(catalog.templates.some((t) => t.id === route[key]), `${id}.${key}`);
    }
    const spare = catalog.questions.find((q) => q.id === route.spareQuestionId);
    assert.equal(spare.role, 'transfer_spare');
  }
});

test('존재하지 않는 개념을 참조하면 unknownConceptRejected 이고 해당 문항만 제외된다', () => {
  const catalog = makeCatalog();
  catalog.questions.find((q) => q.id === 'q-eq-1').conceptIds.push('c-missing');
  const result = validateCatalog(catalog);
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.code === 'unknownConceptRejected');
  assert.ok(err);
  assert.deepEqual(err.questionIds, ['q-eq-1']);
  assert.deepEqual(assignableIds(catalog), ['q-rat-1']);
});

test('경로의 선수 개념이 없는 개념이어도 unknownConceptRejected 이다', () => {
  const catalog = makeCatalog();
  routeOf(catalog, 'q-rat-1').prerequisiteConceptIds.push('c-nowhere');
  assert.ok(codes(validateCatalog(catalog)).includes('unknownConceptRejected'));
  assert.deepEqual(assignableIds(catalog), ['q-eq-1']);
});

test('선수 관계가 순환하면 cyclicGraphRejected 이고 순환에 걸린 문항은 제외된다', () => {
  const catalog = makeCatalog();
  // 이항 → 정수 덧셈뺄셈 → 일차방정식 풀이 → 이항 ... 순환
  catalog.concepts.find((c) => c.id === 'c-int-addsub').prerequisiteIds.push('c-eq-solve');
  const result = validateCatalog(catalog);
  const err = result.errors.find((e) => e.code === 'cyclicGraphRejected');
  assert.ok(err);
  assert.ok(err.conceptIds.includes('c-eq-solve'));
  assert.ok(err.conceptIds.includes('c-int-addsub'));
  assert.ok(!assignableIds(catalog).includes('q-eq-1'));
});

test('보충 경로의 틀이 없으면 brokenRouteRejected 이고 다른 문항은 영향받지 않는다', () => {
  const catalog = makeCatalog();
  routeOf(catalog, 'q-eq-1').similarTemplateId = 'tpl-missing';
  const result = validateCatalog(catalog);
  const err = result.errors.find((e) => e.code === 'brokenRouteRejected');
  assert.ok(err);
  assert.deepEqual(err.questionIds, ['q-eq-1']);
  assert.deepEqual(assignableIds(catalog), ['q-rat-1']);
});

test('보충 경로가 아예 없거나 개념 확인이 2개를 넘거나 예비 문항이 없으면 brokenRouteRejected', () => {
  const noRoute = makeCatalog();
  noRoute.routes = noRoute.routes.filter((r) => r.questionId !== 'q-rat-1');
  assert.ok(codes(validateCatalog(noRoute)).includes('brokenRouteRejected'));
  assert.deepEqual(assignableIds(noRoute), ['q-eq-1']);

  const tooMany = makeCatalog();
  const route = routeOf(tooMany, 'q-eq-1');
  route.conceptCheckQuestionIds = [...route.conceptCheckQuestionIds, 'q-cc-intadd-1'];
  assert.ok(codes(validateCatalog(tooMany)).includes('brokenRouteRejected'));
  assert.deepEqual(assignableIds(tooMany), ['q-rat-1']);

  const noSpare = makeCatalog();
  noSpare.questions = noSpare.questions.filter((q) => q.id !== 'q-eq-spare-1');
  assert.ok(codes(validateCatalog(noSpare)).includes('brokenRouteRejected'));
  assert.deepEqual(assignableIds(noSpare), ['q-rat-1']);
});

test('틀의 단계와 문항 수가 맞지 않으면 brokenRouteRejected', () => {
  const catalog = makeCatalog();
  catalog.templates.find((t) => t.id === routeOf(catalog, 'q-eq-1').foundationTemplateId).itemCount = 2;
  assert.ok(codes(validateCatalog(catalog)).includes('brokenRouteRejected'));
  assert.deepEqual(assignableIds(catalog), ['q-rat-1']);
});

test('정답이 선택지에 없으면 해당 문항은 출제되지 않는다', () => {
  const catalog = makeCatalog();
  catalog.questions.find((q) => q.id === 'q-rat-1').answer = '99';
  assert.equal(validateCatalog(catalog).ok, false);
  assert.deepEqual(assignableIds(catalog), ['q-eq-1']);
});

test('검수 기록이 없는 승인 문항은 출제되지 않는다', () => {
  const catalog = makeCatalog();
  catalog.reviews = catalog.reviews.filter((r) => r.questionId !== 'q-eq-1');
  assert.equal(validateCatalog(catalog).ok, false);
  assert.deepEqual(assignableIds(catalog), ['q-rat-1']);
});

for (const status of ['pending', 'link_only', 'retired']) {
  test(`${status} 상태 문항은 출제 목록에서 제외된다`, () => {
    const catalog = makeCatalog();
    catalog.questions.find((q) => q.id === 'q-eq-1').contentStatus = status;
    assert.deepEqual(assignableIds(catalog), ['q-rat-1']);
  });
}

test('validateCatalog 는 입력을 변경하지 않는다', () => {
  const catalog = makeCatalog();
  const before = JSON.stringify(catalog);
  validateCatalog(catalog);
  listAssignableQuestions(catalog);
  assert.equal(JSON.stringify(catalog), before);
});

test('픽스처 기본 ID는 팀 공통 계약을 따른다', () => {
  assert.deepEqual(IDS, {
    learnerId: 'learner-1',
    mentorId: 'mentor-1',
    assignmentId: 'assignment-1',
    pathId: 'path-1',
    originalAttemptId: 'original-1',
  });
  const state = makeState();
  assert.equal(state.learnerId, 'learner-1');
  assert.equal(state.mentorId, 'mentor-1');
  assert.equal(state.assignments[0].id, 'assignment-1');
  assert.equal(state.paths[0].id, 'path-1');
  assert.equal(state.paths[0].originalAttemptId, 'original-1');
  assert.equal(makeQuestion().id, 'q-eq-1');
  assert.equal(makeQuestion({ id: 'q-x' }).id, 'q-x');

  const cmd = command('SUBMIT_ANSWER', { value: '5' });
  assert.deepEqual(cmd, { type: 'SUBMIT_ANSWER', learnerId: 'learner-1', pathId: 'path-1', value: '5' });
  const counted = runCommands((s, c) => ({ ...s, seen: [...s.seen, c.type] }), { seen: [] }, [command('A'), command('B')]);
  assert.deepEqual(counted.seen, ['A', 'B']);
});
