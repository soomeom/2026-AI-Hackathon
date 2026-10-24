// 로드맵 테스트용 예시 (담당: 지훈). 실제 로드맵이 아니라 방정식 영역 일부만 연결한 예시 그래프다.
import { readFileSync } from 'node:fs';

import { startDiagnostic, submitDiagnostic } from '../public/src/learning/diagnostic.js';

const CONTENT_DIR = new URL('../public/src/content/', import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, CONTENT_DIR), 'utf8'));

export const loadDiagnosticContent = () => ({
  bank: readJson('questions.json').questions,
  config: readJson('diagnostic.json'),
});

export function makeSampleRoadmap() {
  return {
    version: 1,
    source: '테스트용 예시 (실제 로드맵 아님)',
    nodes: [
      { id: 'rm-linear-eq', name: '일차방정식', prerequisiteIds: [], conceptIds: ['astra-equations-l1-일차방정식'] },
      { id: 'rm-sqrt', name: '제곱근', prerequisiteIds: [], conceptIds: ['astra-equations-l2-제곱근'] },
      { id: 'rm-quad-factor', name: '이차방정식의 인수분해', prerequisiteIds: ['rm-linear-eq'], conceptIds: ['astra-equations-l2-이차방정식의 인수분해'] },
      { id: 'rm-discriminant', name: '판별식', prerequisiteIds: ['rm-quad-factor'], conceptIds: ['astra-equations-l3-판별식'] },
      { id: 'rm-vieta', name: '근과 계수의 관계', prerequisiteIds: ['rm-quad-factor', 'rm-sqrt'], conceptIds: ['astra-equations-l3-근과 계수의 관계'] },
    ],
  };
}

/** wrongIds에 있는 문항만 틀리고 나머지는 맞히며 레벨테스트를 끝까지 진행한다 */
export function runDiagnostic({ bank, config }, wrongIds = []) {
  let session = startDiagnostic(bank, config);
  let count = 0;
  while (session.status === 'active') {
    const question = bank.find((entry) => entry.id === session.currentId);
    const correct = !wrongIds.includes(question.id);
    const choice = question.choices.find((entry) => (entry.value === question.answer) === correct);
    session = submitDiagnostic(session, { id: `d${count++}`, questionId: question.id, choiceId: choice.id }, bank, config);
  }
  return session;
}

// 근과 계수의 관계(고졸)와 그 아래 제곱근(중3)까지 틀린 경우
export const WRONG_VIETA_AND_SQRT = ['ged-high-2025-1-math-q06', 'ged-middle-2025-1-math-q15'];
