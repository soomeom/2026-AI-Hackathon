// 문항 틀: 매개변수를 바꿔 원시 문항 { prompt, choices:[{value, misconceptionConceptId?}], answer, conceptIds, solutionSteps } 을 만든다.
// 정답은 항상 코드로 계산한다. 유효성(정답 유일성·중복·분모 0)은 generator 가 검사한다.

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

export function reduceFraction(n, d) {
  if (d === 0) throw new Error('zeroDenominator');
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g + 0, d: (sign * d) / g };
}

const frac = reduceFraction;
const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
const div = (a, b) => frac(a.n * b.d, a.d * b.n);
const neg = (a) => frac(-a.n, a.d);
const fmt = (f) => (f.d === 1 ? `${f.n}` : `${f.n}/${f.d}`);
const paren = (f) => `(${fmt(f)})`;

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const randNonZero = (rng, min, max) => {
  const v = randInt(rng, min, max - 1);
  return v >= 0 ? v + 1 : v;
};
const randFrac = (rng) => frac(randNonZero(rng, -5, 5), randInt(rng, 2, 6));
const signed = (n) => `${n < 0 ? '-' : '+'} ${Math.abs(n)}`;

// cx + c 를 사람이 쓰는 꼴로: 3x - 2, -x, 5
function linear(cx, c) {
  let s = cx === 0 ? '' : cx === 1 ? 'x' : cx === -1 ? '-x' : `${cx}x`;
  if (c !== 0) s = s ? `${s} ${signed(c)}` : `${c}`;
  return s || '0';
}

// 분모가 0 이면 null (그 오답 후보는 버린다)
const tryFrac = (n, d) => (d === 0 ? null : fmt(frac(n, d)));

// a(x + b) = cx + d
function linearEquation(rng) {
  const a = randInt(rng, 2, 5);
  const b = randNonZero(rng, -6, 6);
  let c;
  do c = randNonZero(rng, -3, 3); while (c === a);
  const x = randInt(rng, -5, 9);
  const d = a * (x + b) - c * x;
  const distractors = [
    { value: tryFrac(d - b, a - c), misconceptionConceptId: 'c-distribute-sign' },
    { value: tryFrac(d + a * b, a - c), misconceptionConceptId: 'c-eq-transpose' },
    { value: tryFrac(d - a * b, a + c), misconceptionConceptId: 'c-eq-transpose' },
  ].filter((ch) => ch.value !== null);
  return {
    prompt: `방정식 ${a}(x ${signed(b)}) = ${linear(c, d)} 의 해는?`,
    choices: [{ value: `${x}` }, ...distractors],
    answer: `${x}`,
    conceptIds: ['c-eq-solve'],
    solutionSteps: [`${linear(a, a * b)} = ${linear(c, d)}`, `${linear(a - c, 0)} = ${d - a * b}`, `x = ${x}`],
  };
}

// x + b = d
function transpose(rng) {
  const b = randNonZero(rng, -9, 9);
  const d = randInt(rng, -9, 9);
  const x = d - b;
  return {
    prompt: `x ${signed(b)} = ${d} 일 때, x 의 값은?`,
    choices: [
      { value: `${x}` },
      { value: `${d + b}`, misconceptionConceptId: 'c-eq-transpose' },
      { value: `${-x}`, misconceptionConceptId: 'c-int-addsub' },
      { value: `${-(d + b)}`, misconceptionConceptId: 'c-eq-transpose' },
    ],
    answer: `${x}`,
    conceptIds: ['c-eq-transpose'],
    solutionSteps: [`x = ${d} ${signed(-b)}`, `x = ${x}`],
  };
}

// k(x + m) 전개
function distribute(rng) {
  const k = randInt(rng, -5, -2);
  const m = randNonZero(rng, -6, 6);
  const answer = linear(k, k * m);
  return {
    prompt: `${k}(x ${signed(m)}) 를 바르게 전개한 것은?`,
    choices: [
      { value: answer },
      { value: linear(k, -k * m), misconceptionConceptId: 'c-distribute-sign' },
      { value: linear(k, m), misconceptionConceptId: 'c-distribute-sign' },
      { value: linear(-k, -k * m), misconceptionConceptId: 'c-int-mul' },
    ],
    answer,
    conceptIds: ['c-distribute-sign'],
    solutionSteps: [`(${k}) × x = ${linear(k, 0)}`, `(${k}) × (${m}) = ${k * m}`, answer],
  };
}

// (a) ÷ (b) - (c)
function rationalMixed(rng) {
  const a = randFrac(rng);
  const b = randFrac(rng);
  const c = randFrac(rng);
  const q = div(a, b);
  const answer = fmt(sub(q, c));
  return {
    prompt: `${paren(a)} ÷ ${paren(b)} - ${paren(c)} 의 값은?`,
    choices: [
      { value: answer },
      { value: fmt(add(q, c)), misconceptionConceptId: 'c-int-addsub' },
      { value: fmt(sub(mul(a, b), c)), misconceptionConceptId: 'c-frac-reciprocal' },
      { value: fmt(sub(neg(q), c)), misconceptionConceptId: 'c-int-mul' },
    ],
    answer,
    conceptIds: ['c-rat-calc'],
    solutionSteps: [`${paren(a)} × ${paren(frac(b.d, b.n))} - ${paren(c)}`, `${fmt(q)} - ${paren(c)}`, answer],
  };
}

// (a) - (b), b < 0
function integerAddSub(rng) {
  const a = randNonZero(rng, -9, 9);
  const b = randInt(rng, -9, -1);
  return {
    prompt: `(${a}) - (${b}) 의 값은?`,
    choices: [
      { value: `${a - b}` },
      { value: `${a + b}`, misconceptionConceptId: 'c-int-addsub' },
      { value: `${-(a + b)}`, misconceptionConceptId: 'c-int-addsub' },
      { value: `${b - a}`, misconceptionConceptId: 'c-int-addsub' },
    ],
    answer: `${a - b}`,
    conceptIds: ['c-int-addsub'],
    solutionSteps: [`(${a}) + ${-b}`, `${a - b}`],
  };
}

// (p) ÷ (q)
function reciprocal(rng) {
  const p = randFrac(rng);
  const q = randFrac(rng);
  const answer = fmt(div(p, q));
  return {
    prompt: `${paren(p)} ÷ ${paren(q)} 의 값은?`,
    choices: [
      { value: answer },
      { value: fmt(mul(p, q)), misconceptionConceptId: 'c-frac-reciprocal' },
      { value: fmt(neg(div(p, q))), misconceptionConceptId: 'c-int-mul' },
      { value: fmt(div(q, p)), misconceptionConceptId: 'c-frac-reciprocal' },
    ],
    answer,
    conceptIds: ['c-frac-reciprocal'],
    solutionSteps: [`${paren(p)} × ${paren(frac(q.d, q.n))}`, answer],
  };
}

// 카탈로그 틀 ID → 개념 ID → 생성 함수
export const TEMPLATE_BUILDERS = Object.freeze({
  'tpl-eq-foundation': { 'c-distribute-sign': distribute, 'c-eq-transpose': transpose },
  'tpl-eq-similar': { 'c-eq-solve': linearEquation },
  'tpl-eq-transfer': { 'c-eq-solve': linearEquation },
  'tpl-rat-foundation': { 'c-int-addsub': integerAddSub, 'c-frac-reciprocal': reciprocal },
  'tpl-rat-similar': { 'c-rat-calc': rationalMixed },
  'tpl-rat-transfer': { 'c-rat-calc': rationalMixed },
});
