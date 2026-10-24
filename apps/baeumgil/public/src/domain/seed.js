// 시연용 가명 기본 데이터 (담당: 지훈)
// 문항·개념 등 콘텐츠는 content/ 카탈로그(다은·수영)에서 관리하므로 여기서는 ID로만 가리킨다.

import { DEMO_IDS, createEmptyAppState } from './contracts.js';

// 시연 대표 문항 (content/questions.json)
export const DEMO_QUESTION_ID = 'q-eq-1';

export function createDemoAppState() {
  const state = createEmptyAppState();
  state.learnerId = DEMO_IDS.learner;
  state.mentorId = DEMO_IDS.mentor;
  state.learners = [{ id: DEMO_IDS.learner, name: '하늘', schoolLevel: 'high', goal: null, isDemo: true }];
  state.mentors = [{ id: DEMO_IDS.mentor, name: '김멘토', isDemo: true }];
  // 학습 경로는 화면이 엔진에 START_PATH { pathId: 'path-1', assignmentId: 'assignment-1' }를 보내면 생긴다
  state.assignments = [
    {
      id: DEMO_IDS.assignment,
      learnerId: DEMO_IDS.learner,
      mentorId: DEMO_IDS.mentor,
      questionId: DEMO_QUESTION_ID,
      status: 'assigned',
      assignedAt: null,
    },
  ];
  return state;
}
