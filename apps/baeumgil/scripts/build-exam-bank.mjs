// 검정고시 기출(중졸·고졸 400문항)을 배움길 보충 학습에 쓸 수 있는 문제은행으로 만든다.
// 입력: data/exam-sources/question-drafts.json (원본 이미지·정답표), public/src/content/questions.json (전사 완료 문항)
// 출력: public/src/content/exam-bank.json  { questions, routes, concepts, reviews, summary }
//
// - 전사된 문항(수식 텍스트)은 그대로 쓰고, 나머지는 원본 문항 이미지 + 공식 정답표로 출제한다.
// - 개념(단원)은 추출 텍스트의 한국어 핵심어로 분류하고, 텍스트가 깨진 경우 문항 번호 위치로 추정한다(근거 기록).
// - 보충 경로: 개념 확인·기초 연습 = 선수 단원의 중졸 기출, 유사·새 문제 = 같은 단원의 다른 회차 기출.
// - 가안 정답(answerKeyStatus !== 'final') 회차는 채점에 쓰지 않는다 (pending).
// 실행: node scripts/build-exam-bank.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const drafts = read('data/exam-sources/question-drafts.json').questions;
// 이미지를 직접 보고 확인한 단원 (자동 분류보다 우선)
const overrideFile = read('data/exam-sources/concept-overrides.json');
const overrides = overrideFile.units;
const confirmed = new Set(overrideFile.confirmed ?? []);
for (const [id, o] of Object.entries(overrides)) if (!o.unit) throw new Error(`concept-overrides: ${id} 의 unit 이 없음`);
const transcribed = new Map(read('public/src/content/questions.json').questions.filter((q) => q.kind === 'official').map((q) => [q.id, q]));
const diagnosticQuestions = new Map(read('public/src/content/questions.json').questions.map(q=>[q.id,q]));
const diagnostic = read('public/src/content/diagnostic.json');

// ---------- 단원(개념) 정의 ----------
// rule: 추출 텍스트 핵심어. 위에서부터 먼저 맞는 단원을 쓴다 (구체적인 단원을 앞에 둔다).
const HIGH = [
  ['h-rational', '유리함수와 무리함수', /유리함수|무리함수/, ['m-coord', 'm-linear-func']],
  ['h-proposition', '명제와 조건', /명제|조건|필요|충분|대우|역은/, ['m-triangle', 'm-prime']],
  ['h-set', '집합', /집합|원소/, ['m-prime', 'm-integer']],
  ['h-function', '함수 (역함수·합성함수)', /역함수|합성|함수\s*[^\s]*\s*→|→|일대일|항등함수|상수함수/, ['m-linear-func', 'm-coord']],
  ['h-transform', '평행이동과 대칭이동', /대칭이동|평행이동|대칭/, ['m-coord', 'm-linear-func']],
  ['h-circle', '원의 방정식', /원의|원\s|반지름|중심의 좌표|원이|원과/, ['m-circle', 'm-similarity']],
  ['h-inequality', '부등식', /부등식|해를 수직선/, ['m-inequality', 'm-quad-eq']],
  ['h-line', '직선의 방정식', /(?<!수)직선/, ['m-linear-func', 'm-coord']],
  ['h-points', '두 점 사이의 거리와 내분점', /두 점|내분|선분|무게중심|중점/, ['m-coord', 'm-similarity']],
  ['h-higher-eq', '삼·사차방정식과 연립방정식', /삼차방정식|사차방정식|연립방정식/, ['m-system', 'm-quad-eq']],
  ['h-discriminant', '이차방정식의 판별식', /중근|근을 가질|허근|판별/, ['m-quad-eq', 'm-sqrt']],
  ['h-quad-roots', '이차방정식의 근과 계수', /두 근|두 실근|근을|근이/, ['m-quad-eq', 'm-sqrt']],
  ['h-quad-func', '이차함수의 최대·최소', /이차함수|최댓값|최솟값/, ['m-quad-func', 'm-linear-func']],
  ['h-complex', '복소수', /복소수|허수|켤레|실수\s*의 값은\?\s*\(?단,/, ['m-sqrt', 'm-integer']],
  ['h-factoring', '인수분해', /인수분해/, ['m-quad-eq', 'm-exponent']],
  ['h-remainder', '항등식과 나머지정리', /항등식|나누어떨어|나머지|조립제법|나눈|나누었을/, ['m-expr', 'm-linear-eq']],
  ['h-poly', '다항식의 연산', /다항식|전개/, ['m-exponent', 'm-expr']],
  ['h-combination', '조합', /선택|조합|뽑|고르/, ['m-probability']],
  ['h-counting', '경우의 수와 순열', /경우의 수|순열|여행|나열|일렬|방법의 수/, ['m-probability']],
];
// 텍스트로 분류하지 못할 때의 번호 위치 추정 (2025년 1회 배치 기준)
const HIGH_BY_NUMBER = [null, 'h-poly', 'h-remainder', 'h-factoring', 'h-complex', 'h-discriminant', 'h-quad-roots', 'h-quad-func', 'h-higher-eq',
  'h-inequality', 'h-points', 'h-line', 'h-circle', 'h-transform', 'h-set', 'h-proposition', 'h-function', 'h-function', 'h-rational', 'h-counting', 'h-combination'];

const MIDDLE = [
  ['m-quad-func', '이차함수', /이차함수|포물선|꼭짓점/, ['m-linear-func']],
  ['m-quad-eq', '이차방정식', /이차방정식/, ['m-exponent', 'm-linear-eq']],
  ['m-system', '연립일차방정식', /연립/, ['m-linear-eq']],
  ['m-linear-func', '일차함수와 그래프', /일차함수|기울기|절편/, ['m-coord', 'm-linear-eq']],
  ['m-inequality', '일차부등식', /부등식/, ['m-linear-eq']],
  ['m-linear-eq', '일차방정식', /일차방정식|방정식|둘레의 길이가/, ['m-expr']],
  ['m-rep-decimal', '유리수와 순환소수', /순환소수|유한소수/, ['m-integer', 'm-prime']],
  ['m-probability', '경우의 수와 확률', /확률|경우의 수|동전|주사위|꺼낼 때|뽑을 때/, ['m-integer']],
  ['m-expr', '문자와 식', /문자|식으로|일차식|대입/, ['m-integer']],
  ['m-prime', '소인수분해와 수', /소인수분해|소수|최대공약수|최소공배수|약수|배수/, []],
  ['m-trig', '삼각비', /sin|cos|tan|삼각비/, ['m-similarity']],
  ['m-circle', '원의 성질', /접선|원주각|현의 수직|두 현|수선의 발|외접|내접/, ['m-triangle']],
  ['m-similarity', '닮음과 피타고라스 정리', /닮음|닮은|평행한 직선|피타고라스|직각삼각형/, ['m-triangle']],
  ['m-triangle', '삼각형과 사각형의 성질', /이등변|사각형|평행사변형|마름모|직사각형|외심|내심|삼각형/, ['m-plane-fig']],
  ['m-spread', '산포도와 상관관계', /표준편차|분산|산포|상관관계|산점도/, ['m-stat']],
  ['m-stat', '자료의 정리와 해석', /도수|히스토그램|줄기|평균|중앙값|최빈값|대푯값|조사한/, ['m-integer']],
  ['m-plane-fig', '평면·입체 도형', /평행한 두 직선|부채꼴|원\s*O|중심각|다각형|작도|맞꼭지각|평행선|입체|겉넓이|부피|기둥|다면체|내각|외각|각의 크기|원뿔|구의/, ['m-integer']],
  ['m-sqrt', '제곱근과 실수', /제곱근|무리수|근호|실수/, ['m-rep-decimal', 'm-exponent']],
  ['m-exponent', '지수법칙과 식의 계산', /간단히|단항식|다항식|지수|전개|곱셈 공식/, ['m-expr']],
  ['m-coord', '좌표평면과 그래프', /좌표|그래프|정비례|반비례/, ['m-integer']],
  ['m-integer', '정수와 유리수의 계산', /계산|정수|유리수|절댓값|수직선/, ['m-prime']],
];
const MIDDLE_BY_NUMBER = [null, 'm-prime', 'm-integer', 'm-expr', 'm-linear-eq', 'm-coord', 'm-plane-fig', 'm-stat', 'm-rep-decimal', 'm-exponent', 'm-system',
  'm-linear-func', 'm-triangle', 'm-similarity', 'm-probability', 'm-sqrt', 'm-quad-eq', 'm-quad-func', 'm-trig', 'm-circle', 'm-spread'];

// 기출 수가 적은 단원의 유사·새 문제를 채울 가장 가까운 단원
const RELATED = { 'h-discriminant': ['h-quad-roots'], 'h-quad-roots': ['h-discriminant'], 'm-spread': ['m-stat'] };

const UNITS = new Map([...HIGH, ...MIDDLE].map(([id, name, rule, pre]) => [id, { id, name, rule, pre }]));
const conceptId = (unit) => `ged-${unit}`;

// 전사 문항의 개념(Astra)과 단원 대응 — 텍스트 분류 결과를 우선 쓰되 원문 전사가 있으면 그 텍스트로 분류
// '간단히', '계산한', '조사하여'처럼 여러 단원에 두루 쓰이는 말로 시작하면 약한 근거로 보고 번호 위치를 따른다
const WEAK = /^[^가-힣]*(?:[을를이가의]\s*)?(간단히|계산한|계산하면|조사하여)/;
function classify(text, level, number) {
  const rules = level === 'high' ? HIGH : MIDDLE;
  const prior = (level === 'high' ? HIGH_BY_NUMBER : MIDDLE_BY_NUMBER)[number];
  const hit = rules.find(([, , rule]) => rule.test(text));
  if (hit && !(WEAK.test(text.trim()) && hit[0] !== prior)) return { unit: hit[0], basis: 'keyword' };
  return { unit: prior, basis: 'number_position' };
}

const META = /ged-(high|middle)-(\d{4})-(\d)-math-q(\d{2})/;
const CHOICE_MARK = ['①', '②', '③', '④'];
const LEVEL_NAME = { high: '고졸', middle: '중졸' };

// ---------- 문항 ----------
const items = drafts.map((d) => {
  const [, level, year, session, num] = d.id.match(META);
  const t = transcribed.get(d.id);
  const text = t ? `${t.prompt} ${t.curriculum?.unit ?? ''}` : d.rawText.replace(/^\s*\d+\.\s*/, '');
  const manual = overrides[d.id];
  const auto = classify(text, level, Number(num));
  const { unit, basis } = manual ? { unit: manual.unit, basis: 'manual_review' }
    : confirmed.has(d.id) ? { unit: auto.unit, basis: 'keyword_confirmed' } : auto;
  return { d, t, level, year: Number(year), session: Number(session), number: Number(num), unit, basis: t ? 'transcribed_text' : basis };
});

const usable = (it) => it.d.answerKeyStatus === 'final';
const questions = [];
const reviews = [];
for (const it of items) {
  const reference = {
    institution: '한국교육과정평가원', year: it.year, session: it.session, qualification: LEVEL_NAME[it.level],
    questionNumber: it.number, answerStatus: it.d.answerKeyStatus, usageReviewStatus: 'unverified',
  };
  if (it.t) continue; // 전사 문항은 questions.json 의 원본을 그대로 쓴다
  const label = `${it.year}년 ${it.session}회 ${LEVEL_NAME[it.level]} 검정고시 수학 ${it.number}번`;
  questions.push({
    id: it.d.id,
    kind: 'official',
    role: 'exam',
    format: 'image',
    contentStatus: usable(it) ? 'approved' : 'pending',
    approvalScope: 'official_image_with_answer_key',
    prompt: `${label} (원본 문항 이미지)`,
    image: it.d.image,
    pageImage: it.d.pageImage,
    answerFormat: 'choice',
    choices: CHOICE_MARK.map((mark, i) => ({ id: 'abcd'[i], value: String(i + 1), text: mark })),
    answer: String(it.d.correctChoiceNumber),
    solutionSteps: [],
    conceptIds: [conceptId(it.unit)],
    examUnit: it.unit,
    reference,
    review: { answerKey: it.d.answerKeyStatus, imageVisuallyReviewed: false, conceptTagging: it.basis },
  });
  reviews.push({
    questionId: it.d.id, reviewers: ['정답표 자동 연결'], reviewedOn: '2026-10-24',
    checks: { answerVerified: usable(it), singleCorrectAnswer: true, authoredNotCopied: false },
    note: '공식 정답표 번호와 연결. 원본 이미지 육안 검수·이용 조건 확인 전.',
  });
}

// ---------- 보충 경로 ----------
const usableItems = items.filter(usable);
const byUnit = new Map();
for (const it of usableItems) byUnit.set(it.unit, [...(byUnit.get(it.unit) ?? []), it]);
// 최근 회차·전사 문항 우선
const order = (a, b) => (Number(Boolean(b.t)) - Number(Boolean(a.t))) || (b.year - a.year) || (b.session - a.session) || (a.number - b.number);
const idsOf = (list) => list.map((x) => x.d.id);

const routes = [];
for (const it of usableItems) {
  const same = (byUnit.get(it.unit) ?? []).filter((x) => x !== it && x.level === it.level).sort(order);
  const preUnits = UNITS.get(it.unit).pre;
  const prePool = preUnits.flatMap((u) => (byUnit.get(u) ?? []).filter((x) => x.level === 'middle')).sort(order);
  // 개념 확인 2문항: 전사 문항의 연결 문항(fallback) → 선수 단원마다 1개 → 같은 단원
  const checks = [];
  const fb = it.t?.fallback_question_id;
  if (fb && usableItems.some((x) => x.d.id === fb)) checks.push(fb);
  for (const u of preUnits) {
    const pick = (byUnit.get(u) ?? []).filter((x) => x.level === 'middle' && !checks.includes(x.d.id)).sort(order)[0];
    if (pick && checks.length < 2) checks.push(pick.d.id);
  }
  for (const x of [...prePool, ...same]) if (checks.length < 2 && !checks.includes(x.d.id)) checks.push(x.d.id);
  let foundation = idsOf(prePool).filter((id) => !checks.includes(id));
  // Reviewed diagnostic originals use the same exact graph in regular remedial lessons.
  // Otherwise custom fallback questions would be silently replaced with generic exam-unit neighbours.
  const curated=it.t?.level===3&&it.t.prerequisite_question_ids?.length;
  if(curated){
    checks.splice(0,checks.length,...it.t.prerequisite_question_ids.slice(0,2));
    const visited=new Set();
    const visit=id=>{if(visited.has(id))return;visited.add(id);(diagnosticQuestions.get(id)?.prerequisite_question_ids??[]).forEach(visit);};
    it.t.prerequisite_question_ids.forEach(visit);
    const conceptIds=new Set([...visited].flatMap(id=>diagnosticQuestions.get(id).conceptIds));
    foundation=[...new Set((diagnostic.learningBundles??[]).filter(b=>conceptIds.has(b.conceptId)).flatMap(b=>b.questionIds))].filter(id=>!checks.includes(id));
    if(foundation.length<3)throw new Error(`curated foundation pool too small: ${it.d.id}`);
  }
  let sameIds = idsOf(same).filter((id) => !checks.includes(id));
  // 같은 단원 기출이 적으면(예: 산포도, 판별식) 가장 가까운 단원 기출로 채운다
  if (sameIds.length < 3) {
    const near = (RELATED[it.unit] ?? []).flatMap((u) => byUnit.get(u) ?? []).filter((x) => x.level === it.level && x !== it).sort(order);
    sameIds = [...sameIds, ...idsOf(near).filter((id) => !checks.includes(id) && !sameIds.includes(id))];
  }
  const ok = checks.length >= 1 && foundation.length >= 3 && sameIds.length >= 3;
  routes.push({
    id: `route-${it.d.id}`,
    kind: 'exam_pool',
    questionId: it.d.id,
    coreConceptId: it.t ? it.t.conceptIds[0] : conceptId(it.unit),
    examUnit: it.unit,
    prerequisiteUnits: curated ? [] : preUnits,
    ...(curated ? {prerequisiteConceptIds:it.t.prerequisite_concept,prerequisiteBasis:'reviewed_diagnostic_graph'} : {}),
    conceptCheckQuestionIds: checks.slice(0, 2),
    foundationQuestionIds: ok ? foundation : (foundation.length >= 3 ? foundation : [...foundation, ...sameIds].slice(0, Math.max(3, foundation.length))),
    similarQuestionIds: sameIds,
    transferQuestionIds: sameIds,
    conceptTagging: it.t ? 'transcribed_text' : it.basis,
  });
}

// ---------- 개념 ----------
const concepts = [...UNITS.values()].map((u) => ({
  id: conceptId(u.id), name: u.name, summary: `검정고시 ${u.id.startsWith('h-') ? '고졸' : '중졸'} 수학 단원`, prerequisiteIds: u.pre.map(conceptId),
}));
// 전사 문항의 Astra 개념도 단원 개념에 이어 준다 (요약·AI 근거에서 이름이 보이도록 이미 concepts.json 에 있음)

const count = (list, key) => list.reduce((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
const summary = {
  total: items.length,
  usable: usableItems.length,
  pendingProvisional: items.length - usableItems.length,
  transcribed: items.filter((x) => x.t).length,
  imageQuestions: questions.filter((q) => q.contentStatus === 'approved').length,
  routes: routes.length,
  conceptTagging: count(items, (x) => x.basis),
  byUnit: count(usableItems, (x) => x.unit),
};

// 앱 안 초기 진단(적응형 6영역)이 같은 카탈로그에서 설정을 읽도록 함께 싣는다 (원본: content/diagnostic.json)
const out = { schemaVersion: 1, generator: 'scripts/build-exam-bank.mjs', summary, diagnostic, concepts, questions, routes, reviews };
writeFileSync(new URL('public/src/content/exam-bank.json', root), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
