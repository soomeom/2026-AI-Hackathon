// 화면 공통 문구와 표시 유틸. 학생 화면에는 엔진의 코드값 대신 이 문장을 보여 준다.

export const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const FLOW = ['original_attempt', 'concept_check', 'foundation_practice', 'similar_practice', 'original_retry', 'transfer_check', 'completed'];

export const STAGE_LABEL = {
  original_attempt: '기출 풀이',
  concept_check: '개념 확인',
  foundation_practice: '기초 연습',
  similar_practice: '유사 문제',
  original_retry: '기출 재도전',
  transfer_check: '새 문제 확인',
  completed: '완료',
  needs_mentor: '멘토 확인',
};

export const SKIPPABLE = ['concept_check', 'foundation_practice', 'similar_practice'];

export const REASON_TEXT = {
  originalCorrect: '맞혔어요! 처음 보는 문제로 한 번 더 확인해 볼까요?',
  originalIncorrect: '어디서 막혔는지 짧게 확인해 봐요.',
  originalAbstained: '괜찮아요. 어디서 막혔는지 짧게 확인해 봐요.',
  conceptCheckDone: '필요한 기초부터 연습해요.',
  conceptCheckAllCorrect: '기초 확인 문제를 모두 맞혔어요. 비슷한 문제로 넘어가요.',
  foundationPassed: '좋아요, 비슷한 문제에 적용해 봐요.',
  foundationRetry: '조금 더 연습해 봐요. 새 문제 3개를 준비했어요.',
  foundationMaxRounds: '여기는 멘토와 함께 확인하는 게 좋겠어요.',
  similarDone: '처음 틀렸던 문제에 다시 도전해요.',
  retryDone: '마지막으로 처음 보는 문제로 확인해요.',
  transferDone: '오늘 학습을 정리해요.',
};

export const RESULT = {
  correct: { mark: '✓', text: '정답' },
  incorrect: { mark: '✗', text: '오답' },
  abstained: { mark: '?', text: '모름' },
};

export const resultBadge = (result) => (RESULT[result]
  ? `<span class="result ${result}">${RESULT[result].mark} ${RESULT[result].text}</span>`
  : '<span class="muted">—</span>');

export const ORIGIN_LABEL = { catalog: '자체 제작 문항', generated: '숫자를 바꿔 만든 연습 문제', spare: '검수된 예비 문항' };

export const EVIDENCE_LABEL = { observed: '직접 확인', inferred: '추정', needs_review: '확인 필요' };

export const FLAG_TEXT = {
  transfer_previously_seen: '새 문제 확인에 이미 본 문제가 나와 독립 적용에서 제외',
  transfer_history_unknown: '노출 기록을 확인할 수 없어 독립 적용에서 제외',
  transfer_assisted: '새 문제 확인에서 도움을 받아 독립 적용에서 제외',
  transfer_not_measured: '새 문제를 확보하지 못해 독립 적용 미측정',
  needs_mentor: '멘토 확인이 필요한 경로',
  stage_skipped: '건너뛴 단계가 있음',
  mentor_override: '멘토가 단계를 조정함',
};

export const formatSeconds = (ms) => (ms === null || ms === undefined ? '—' : `${Math.round(ms / 1000)}초`);

export function stepsBar(path) {
  const visited = new Set((path.stageHistory ?? []).map((h) => h.to));
  return `<ol class="steps" aria-label="학습 단계">${FLOW.map((s) => {
    const cls = s === path.stage ? 'now' : visited.has(s) ? 'done' : '';
    const skipped = (path.skippedStageIds ?? []).includes(s);
    return `<li class="step ${cls}${skipped ? ' skipped' : ''}"${s === path.stage ? ' aria-current="step"' : ''}>${STAGE_LABEL[s]}${skipped ? ' (건너뜀)' : ''}</li>`;
  }).join('')}</ol>`;
}
