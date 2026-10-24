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

// 멘토 화면 상단: 학생 정보 + 메뉴 (칸아카데미 교실 화면처럼 학생 → 할 일 → 상세 순서)
export const mentorTabs = (active, learner) => `<div class="card flat student-bar">
  <div class="avatar" aria-hidden="true">${esc((learner?.name ?? '학')[0])}</div>
  <div class="who"><b>${esc(learner?.name ?? '학습자')}</b><span class="muted small">고졸 검정고시 수학${learner?.isDemo ? ' · 시연용 가명 학생' : ''}</span></div>
  <span class="pill student-bar-page">${({ home: '멘토 홈', roadmap: '로드맵', learning: '학습 기록', planning: '수업 준비', sessions: '회기·일지' })[active] ?? ''}</span>
</div>`;

// 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
export const todaySeoul = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// 아이콘 (Lucide 계열 선 아이콘, 장식용이므로 aria-hidden)
const svg = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  help: svg('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  bulb: svg('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>'),
  hand: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  play: svg('<path d="m6 3 14 9-14 9z"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  skip: svg('<path d="m5 4 10 8-10 8zM19 5v14"/>'),
  flag: svg('<path d="M4 22V4a1 1 0 0 1 1-1h11l-2 4 2 4H5"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  target: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
};

// ---------- 문항 표시 (수식·원본 이미지·출처) ----------
// $...$ 구간은 KaTeX 로 그리고 나머지는 글자로 둔다. KaTeX 를 못 불러오면 원문을 그대로 보여 준다.
export function mathHtml(text) {
  const katex = globalThis.katex;
  return String(text ?? '').split('$').map((part, i) => {
    if (i % 2 === 0 || !katex) return esc(part);
    try { return katex.renderToString(part, { throwOnError: false, trust: false, output: 'htmlAndMathml' }); } catch { return esc(part); }
  }).join('');
}

export const choiceHtml = (c) => (c.latex ? mathHtml(`$${c.latex}$`) : mathHtml(c.text ?? c.value));

export function sourceLabel(item) {
  const r = item?.reference;
  if (!r?.year) return item?.kind === 'official' ? '검정고시 기출' : '';
  return `${r.year}년 ${r.session}회 ${r.qualification} 검정고시 수학 ${r.questionNumber}번 · ${r.institution ?? '한국교육과정평가원'}${r.answerStatus === 'final' ? ' · 확정 정답' : ''}`;
}

// 문제 본문: 원본 이미지 문항은 이미지, 전사 문항은 수식, 도형·원본 이미지가 있으면 함께
export function questionBodyHtml(item, { promptId } = {}) {
  const idAttr = promptId ? ` id="${promptId}"` : '';
  if (item.format === 'image' && item.image) {
    return `<figure class="exam-image"${idAttr}><img src="${esc(item.image)}" alt="${esc(sourceLabel(item))} 원본 문항 (발문·그림·선택지 포함)" loading="lazy">
      <figcaption class="muted small">원본 문항 이미지 · 선택지 번호(①~④)로 답해요</figcaption><button class="ghost small" data-image-zoom data-image-src="${esc(item.image)}">문항 이미지 크게 보기</button></figure>`;
  }
  return `<p class="prompt"${idAttr}>${mathHtml(item.prompt)}</p>
    ${item.figure?.src ? `<img class="figure" src="${esc(item.figure.src)}" alt="${esc(item.figure.alt ?? '문항 그림')}"><button class="ghost small" data-image-zoom data-image-src="${esc(item.figure.src)}">문항 그림 크게 보기</button>` : ''}
    ${item.sourceImage ? `<details class="source"><summary>원본 문항 이미지 보기</summary><img src="${esc(item.sourceImage)}" alt="원본 문항"><button class="ghost small" data-image-zoom data-image-src="${esc(item.sourceImage)}">원본 이미지 크게 보기</button></details>` : ''}`;
}

// 목록용 짧은 이름 (기출은 회차·번호·단원, 자체 제작은 문제 글)
export function questionLabelHtml(q, catalog) {
  if (!q) return '';
  const r = q.reference;
  if (r?.year) {
    const unit = catalog?.concepts?.find((c) => c.id === q.conceptIds?.[0])?.name;
    return `${r.year}년 ${r.session}회 ${r.qualification} ${r.questionNumber}번${unit ? ` · ${esc(unit)}` : ''}`;
  }
  return mathHtml(q.prompt);
}
