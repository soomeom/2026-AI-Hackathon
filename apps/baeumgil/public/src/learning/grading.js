// 채점은 코드로만 한다. 선택지 값과 정답 값을 정규화해 비교한다.
import { normalizeChoiceValue } from './exposure.js';

export class GradingError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function gradeAnswer(question, { choiceId = null, abstained = false } = {}) {
  if (abstained) return 'abstained';
  if (choiceId === null || choiceId === undefined) throw new GradingError('emptySubmission');
  const choice = question.choices.find((c) => c.id === choiceId);
  if (!choice) throw new GradingError('unknownChoice');
  return normalizeChoiceValue(choice.value) === normalizeChoiceValue(question.answer) ? 'correct' : 'incorrect';
}
