// 시연 범위: 실제 학습을 제공하는 과목만 enabled로 표시한다.
export const SUBJECTS = Object.freeze([
  { id: 'math', name: '수학', enabled: true },
  { id: 'korean', name: '국어', enabled: false },
  { id: 'english', name: '영어', enabled: false },
  { id: 'social', name: '사회', enabled: false },
  { id: 'science', name: '과학', enabled: false },
  { id: 'history', name: '한국사', enabled: false },
].map(Object.freeze));

export const isSubjectEnabled = id => SUBJECTS.some(subject => subject.id === id && subject.enabled);
