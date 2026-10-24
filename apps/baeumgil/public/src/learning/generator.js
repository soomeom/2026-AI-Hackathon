// 단계별 연습 문항 생성. 틀에서 만들고, 코드로 검사하고, 실패하면 검수된 예비 문항으로 대체한다.
import { TEMPLATE_BUILDERS } from '../content/templates.js';
import { fingerprintQuestion, classifyNovelty, normalizeChoiceValue } from './exposure.js';

export const MAX_GENERATION_ATTEMPTS = 20; // 문항 1개당

const STAGE_TEMPLATE_KEY = {
  foundation_practice: 'foundationTemplateId',
  similar_practice: 'similarTemplateId',
  transfer_check: 'transferTemplateId',
};

const CHOICE_COUNT = 4;
const ZERO_DENOMINATOR = /\/\s*\(?\s*[+-]?0+(?:\.0+)?(?![\d.])|÷\s*\(?\s*[+-]?0+(?:\.0+)?\s*\)?(?![\d./])/;

export function validateGeneratedItem(raw) {
  const values = (raw.choices ?? []).map((c) => String(c.value));
  if (values.length !== CHOICE_COUNT) return { ok: false, reason: 'choiceCount' };
  if ([raw.prompt, ...values].some((t) => ZERO_DENOMINATOR.test(t))) return { ok: false, reason: 'zeroDenominator' };
  const normalized = values.map(normalizeChoiceValue);
  if (new Set(normalized).size !== normalized.length) return { ok: false, reason: 'duplicateChoice' };
  const matches = normalized.filter((v) => v === normalizeChoiceValue(raw.answer)).length;
  if (matches === 0) return { ok: false, reason: 'answerMissing' };
  if (matches > 1) return { ok: false, reason: 'answerNotUnique' };
  return { ok: true };
}

// 카탈로그 문항 또는 원시 생성 문항 → 화면에 낼 문항 인스턴스
export function instanceFromQuestion(question, { id, stage, origin = 'catalog', templateId = null }) {
  const instance = {
    id,
    stage,
    origin,
    sourceQuestionId: question.id ?? null,
    templateId,
    prompt: question.prompt,
    choices: question.choices.map((c) => ({ ...c })),
    answer: question.answer,
    conceptIds: [...(question.conceptIds ?? [])],
    solutionSteps: [...(question.solutionSteps ?? [])],
  };
  instance.fingerprint = fingerprintQuestion(instance);
  return instance;
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generatePractice({
  catalog, route, stage, learnerId, state, rng = Math.random,
  templates = TEMPLATE_BUILDERS, focusConceptId = null, idPrefix = `${route.id}:${stage}`,
}) {
  const key = STAGE_TEMPLATE_KEY[stage];
  if (!key) throw new Error(`generatePractice: 지원하지 않는 단계 ${stage}`);
  const template = catalog.templates.find((t) => t.id === route[key]);
  if (!template) return { status: 'unavailable', reason: 'templateMissing', attempts: 0 };

  // 우선 연습 개념을 앞으로: [focus, other, focus, ...]
  const concepts = [...template.conceptIds];
  const focusIndex = concepts.indexOf(focusConceptId);
  if (focusIndex > 0) concepts.unshift(...concepts.splice(focusIndex, 1));

  const builders = templates[template.id] ?? {};
  const requireFirstSeen = stage === 'transfer_check';
  const used = new Set();
  const acceptable = (item) =>
    !used.has(item.fingerprint) && (!requireFirstSeen || classifyNovelty(state, learnerId, item.fingerprint) === 'first_seen');

  const items = [];
  let attempts = 0;
  for (let slot = 0; slot < template.itemCount; slot++) {
    const id = `${idPrefix}:${slot + 1}`;
    const build = builders[concepts[slot % concepts.length]];
    let item = null;
    for (let n = 0; build && n < MAX_GENERATION_ATTEMPTS && !item; n++) {
      attempts++;
      let raw;
      try {
        raw = build(rng);
      } catch {
        continue;
      }
      if (!validateGeneratedItem(raw).ok) continue;
      const choices = shuffle(raw.choices, rng).map((c, k) => ({ ...c, id: String.fromCharCode(97 + k) }));
      const candidate = instanceFromQuestion({ ...raw, id: null, choices }, { id, stage, origin: 'generated', templateId: template.id });
      if (acceptable(candidate)) item = candidate;
    }
    if (!item) {
      const spare = catalog.questions.find((q) => q.id === route.spareQuestionId);
      const candidate = spare && instanceFromQuestion(spare, { id, stage, origin: 'spare' });
      if (!candidate || !acceptable(candidate)) {
        return { status: 'unavailable', reason: requireFirstSeen ? 'noFirstSeenItem' : 'generationFailed', attempts };
      }
      item = candidate;
    }
    used.add(item.fingerprint);
    items.push(item);
  }
  return { status: 'ok', items, attempts, source: items.some((i) => i.origin === 'spare') ? 'spare' : 'generated' };
}
