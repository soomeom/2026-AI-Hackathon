import { gradeAnswer } from './grading.js';

export const DIAGNOSTIC_STAGES = { 3: 'original', 2: 'prerequisite', 1: 'foundation' };
export const DIAGNOSTIC_STAGE_NAMES = { original: '고졸 본 문항', prerequisite: '1차 선수 개념', foundation: '2차 기초 개념' };
export const ROADMAP_STEPS = ['기초 다지기', '핵심 선수 개념 연결', '고졸 기출 정복'];

// Snapshot fields for new attempts; old records are enriched on read, never rewritten.
export function diagnosticLog(attempt, bank) {
  const q = bank.find(q => q.id === attempt.questionId);
  return { ...attempt, conceptTags: attempt.conceptTags ?? q?.conceptIds ?? [],
    conceptName: attempt.conceptName ?? q?.curriculum?.core ?? attempt.questionId,
    stage: attempt.stage ?? DIAGNOSTIC_STAGES[attempt.level], correct: attempt.result === 'correct',
    metadataSource: attempt.conceptTags ? 'answer_snapshot' : 'catalog_backfill' };
}

export function buildRoadmap(diagnostic, bank, config, practice = { attempts: [] }) {
  const byId = new Map(bank.map(q => [q.id, q]));
  const logs = diagnostic.attempts.map(a => diagnosticLog(a, bank));
  const groups = new Map();
  for (const log of logs) for (const conceptId of log.conceptTags) {
    const key = `${log.domain}:${conceptId}`;
    if (!groups.has(key)) groups.set(key, { conceptId, domain: log.domain, logs: [] });
    groups.get(key).logs.push(log);
  }
  const cards = [], mastered = [], recheck = [], confirmed = [];
  for (const [id, group] of groups) {
    const bundle = config.learningBundles?.find(b => b.conceptId === group.conceptId && b.domain === group.domain);
    const level = group.logs[0].level;
    const failed = group.logs.filter(a => a.result !== 'correct');
    const independent = group.logs.some(a => a.result === 'correct' && a.independent);
    const questionIds = bundle?.questionIds ?? [...new Set(group.logs.map(a => a.questionId))];
    const latestPractice = new Map((practice.attempts ?? []).filter(a => a.cardId === id).map(a => [a.questionId,a.result]));
    const correctIds = new Set([...latestPractice].filter(([,result])=>result==='correct').map(([id])=>id));
    const card = { id, conceptId: group.conceptId, domain: group.domain, level, step: level,
      title: bundle?.title ?? group.logs[0].conceptName, explanation: bundle?.explanation ?? '', questionIds,
      evidenceQuestionIds: [...new Set(group.logs.map(a => a.questionId))],
      results: group.logs.map(a => a.result),
      status: failed.length ? 'needs_learning' : independent ? (level === 3 ? 'mastered' : 'confirmed') : 'needs_recheck',
      reason: failed.some(a => a.result === 'incorrect') ? '오답에서 확인된 복습 대상' : failed.length ? '모름으로 답해 추가 확인 필요' : independent ? '처음 본 문항을 도움 없이 맞힘' : '도움·재노출 정답: 혼자 다시 확인 필요',
      practiceCorrect: questionIds.filter(id => correctIds.has(id)).length, practiceTotal: questionIds.length,
      practiceComplete: questionIds.length > 0 && questionIds.every(id => correctIds.has(id)), dependsOn: [],
    };
    if (card.status === 'mastered') mastered.push(card);
    else if (card.status === 'confirmed') confirmed.push(card);
    else if (card.status === 'needs_recheck') recheck.push(card);
    else cards.push(card);
  }
  // Only observed needs become tasks. Unmeasured dependencies are never invented as weaknesses.
  const tasks = [...cards, ...recheck];
  for (const card of tasks) {
    const concepts = new Set(), visited = new Set();
    const visit = id => {
      if (visited.has(id)) return; visited.add(id);
      const q = byId.get(id); if (!q) return;
      for (const lower of q.prerequisite_question_ids ?? (q.fallback_question_id ? [q.fallback_question_id] : [])) {
        (byId.get(lower)?.conceptIds ?? []).forEach(c => concepts.add(c)); visit(lower);
      }
    };
    card.evidenceQuestionIds.forEach(visit);
    card.dependsOn = tasks.filter(c => c.id !== card.id && c.domain === card.domain && concepts.has(c.conceptId)).map(c => c.id);
  }
  const attempted = new Set(logs.map(a => a.questionId));
  const unmeasured = config.domains.flatMap(d => d.levels[3].filter(id => !attempted.has(id)).map(id => ({ questionId: id, domain: d.id, title: byId.get(id)?.curriculum?.core ?? id })));
  return { version: 1, legacy: logs.some(a => a.metadataSource === 'catalog_backfill'),
    domains: config.domains.map(d => ({ id: d.id, name: d.name, steps: ROADMAP_STEPS.map((title, i) => ({ step: i + 1, title, cards: cards.filter(c => c.domain === d.id && c.step === i + 1) })) })),
    mastered, confirmed, recheck, unmeasured,
    nextCardId: tasks.filter(c => !c.practiceComplete).sort((a, b) => a.step - b.step)[0]?.id ?? null,
  };
}

export const roadmapCards = roadmap => [...roadmap.domains.flatMap(d => d.steps.flatMap(s => s.cards)), ...roadmap.recheck, ...roadmap.mastered, ...roadmap.confirmed];

export function validRoadmapPractice(p, { diagnostic, bank, config } = {}) {
  try {
    if(!p||!Array.isArray(p.attempts)||new Set(p.attempts.map(a=>a.id)).size!==p.attempts.length)return false;
    if(!p.attempts.every(a=>typeof a.id==='string'&&typeof a.cardId==='string'&&typeof a.questionId==='string'&&Array.isArray(a.conceptTags)&&a.conceptTags.every(c=>typeof c==='string')&&typeof a.answeredAt==='string'&&!Number.isNaN(Date.parse(a.answeredAt))&&['correct','incorrect','abstained'].includes(a.result)&&a.correct===(a.result==='correct')&&(a.helpUsed===undefined||typeof a.helpUsed==='boolean')&&a.evidence==='review_practice'))return false;
    if(p.cardId&&(typeof p.cardId!=='string'||typeof p.questionId!=='string'||typeof p.roundId!=='string'))return false;
    if(p.answerId&&!p.attempts.some(a=>a.id===p.answerId&&a.cardId===p.cardId&&a.questionId===p.questionId))return false;
    if(p.presentedQuestionIds&&!Array.isArray(p.presentedQuestionIds))return false;
    if(bank&&config&&diagnostic){
      const cards=roadmapCards(buildRoadmap(diagnostic,bank,config));
      const allowed=(cardId,questionId)=>cards.some(c=>c.id===cardId&&c.questionIds.includes(questionId));
      if(p.cardId&&!allowed(p.cardId,p.questionId))return false;
      for(const a of p.attempts){
        if(!allowed(a.cardId,a.questionId))return false;
        const q=bank.find(q=>q.id===a.questionId);
        if(gradeAnswer(q,a)!==a.result)return false;
      }
    }
    return true;
  }catch{return false;}
}

export function submitRoadmapPractice(practice, input, diagnostic, bank, config) {
  if (!input.id || !input.answeredAt || Number.isNaN(Date.parse(input.answeredAt))) throw new Error('invalidPracticeInput');
  if(input.abstained!==undefined&&typeof input.abstained!=='boolean'||input.abstained&&input.choiceId!=null)throw new Error('invalidPracticeAnswer');
  const previous = practice.attempts.find(a => a.id === input.id);
  if (previous) {
    if (previous.cardId !== input.cardId || previous.questionId !== input.questionId || previous.choiceId !== (input.choiceId ?? null) || previous.abstained !== Boolean(input.abstained)) throw new Error('practiceConflict');
    return practice;
  }
  const card = roadmapCards(buildRoadmap(diagnostic, bank, config, practice)).find(c => c.id === input.cardId);
  if (!card?.questionIds.includes(input.questionId)) throw new Error('invalidPracticeQuestion');
  const q = bank.find(q => q.id === input.questionId);
  if (q?.contentStatus !== 'approved') throw new Error('unapprovedPracticeQuestion');
  const result = gradeAnswer(q, input);
  const attempt = { id: input.id, cardId: card.id, questionId: q.id, domain: card.domain, conceptTags: q.conceptIds,
    stage: DIAGNOSTIC_STAGES[card.level], result, correct: result === 'correct', choiceId: input.choiceId ?? null,
    abstained: Boolean(input.abstained), helpUsed:Boolean(input.helpUsed), answeredAt: input.answeredAt, evidence: 'review_practice' };
  return { ...practice, attempts: [...practice.attempts, attempt] };
}
