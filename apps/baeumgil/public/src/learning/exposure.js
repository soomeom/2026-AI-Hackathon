// 문항 지문(fingerprint)과 학생별 신규 여부 판정.
import { reduceFraction } from '../content/templates.js';

const MINUS_LIKE = /[‐-―−﹘﹣－]/g;

export function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').replace(MINUS_LIKE, '-').replace(/\s+/g, '');
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?';
const NUMERIC_VALUE = new RegExp(`^\\(?(${NUMBER})\\)?(?:/\\(?(${NUMBER})\\)?)?$`);

// "0.5" → { n: 5, d: 10 }
function toIntegerRatio(text) {
  const [whole, decimals = ''] = text.replace(/^\+/, '').split('.');
  const scale = 10 ** decimals.length;
  return { n: Number(whole + decimals), d: scale };
}

// 숫자·분수 값은 기약분수로, 식은 공백·유니코드만 정규화한다. 1/2, 2/4, 0.5 는 모두 "1/2".
export function normalizeChoiceValue(value) {
  const text = normalizeText(value);
  const m = text.match(NUMERIC_VALUE);
  if (!m) return text;
  const top = toIntegerRatio(m[1]);
  const bottom = m[2] === undefined ? { n: 1, d: 1 } : toIntegerRatio(m[2]);
  if (bottom.n === 0) return text;
  const { n, d } = reduceFraction(top.n * bottom.d, top.d * bottom.n);
  return d === 1 ? `${n}` : `${n}/${d}`;
}

// ID·선택지 순서·선택지 ID 는 제외하고, 본문·조건과 정렬된 선택지 값 집합으로만 만든다.
export function fingerprintQuestion(instance) {
  const stem = normalizeText(instance.prompt);
  const conditions = normalizeText(instance.conditions ?? '');
  const values = (instance.choices ?? []).map((c) => normalizeChoiceValue(c.value)).sort();
  return JSON.stringify([stem, conditions, values]);
}

function historyIntegrityOf(state, learnerId) {
  const h = state.historyIntegrity;
  return h && typeof h === 'object' ? h[learnerId] : h;
}

// 노출 이력을 믿을 수 없으면 'unknown' (first_seen 으로 취급하지 않는다)
export function classifyNovelty(state, learnerId, fingerprint) {
  if (historyIntegrityOf(state, learnerId) === 'unknown') return 'unknown';
  const seen = (state.exposures ?? []).some((e) => e.learnerId === learnerId && e.fingerprint === fingerprint);
  return seen ? 'already_seen' : 'first_seen';
}
