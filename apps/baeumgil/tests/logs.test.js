import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ATTENDANCE, ERROR_CODES, LOG_STATUSES, toSeoulLocalDate } from '../public/src/domain/contracts.js';
import { createDemoAppState } from '../public/src/domain/seed.js';
import {
  MENTORING_COMMANDS,
  applyMentoringCommand,
  buildMonthlyLedger,
  formatLedgerAsTsv,
  getSessionLogView,
} from '../public/src/mentoring/logs.js';

const { CREATE_SESSION, UPDATE_SESSION, SAVE_LOG_DRAFT, CONFIRM_LOG } = MENTORING_COMMANDS;

const byId = (list, id) => list.find((entry) => entry.id === id);

function createRunner() {
  let counter = 0;
  const options = {
    now: () => new Date('2026-10-24T06:00:00.000Z'),
    createId: (prefix) => `${prefix}-${++counter}`,
  };
  let state = createDemoAppState();
  return {
    run(command) {
      const result = applyMentoringCommand(state, command, options);
      if (result.ok) {
        state = result.value.state;
      }
      return result;
    },
    get state() {
      return state;
    },
  };
}

function attendedSession(runner, { localDate = '2026-10-24', activityMinutes = 60 } = {}) {
  const created = runner.run({
    type: CREATE_SESSION,
    learnerId: 'learner-1',
    mentorId: 'mentor-1',
    localDate,
    attendance: ATTENDANCE.ATTENDED,
    activityMinutes,
  });
  return created.value.events[0].sessionId;
}

function confirmedLog(runner, sessionId, mentorText = '일차방정식 이항 연습') {
  const draft = runner.run({ type: SAVE_LOG_DRAFT, sessionId, mentorText });
  const logId = draft.value.events[0].logId;
  const confirmed = runner.run({ type: CONFIRM_LOG, logId, reviewed: true });
  assert.equal(confirmed.ok, true);
  return logId;
}

test('회기를 만들면 출석·활동 시간은 멘토가 입력하기 전까지 비어 있다', () => {
  const runner = createRunner();
  const result = runner.run({ type: CREATE_SESSION, learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24' });
  assert.equal(result.ok, true);
  const session = byId(runner.state.sessions, result.value.events[0].sessionId);
  assert.equal(session.attendance, ATTENDANCE.NOT_RECORDED);
  assert.equal(session.activityMinutes, null);
  assert.deepEqual(runner.state.logs, []);
});

test('잘못된 회기 날짜는 거부한다', () => {
  const runner = createRunner();
  const result = runner.run({ type: CREATE_SESSION, learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-02-30' });
  assert.equal(result.error.code, ERROR_CODES.INVALID_LOCAL_DATE);
});

test('회기 수정은 변경 이력을 남기고, 바뀐 것이 없으면 아무 일도 하지 않는다', () => {
  const runner = createRunner();
  const sessionId = attendedSession(runner);
  const updated = runner.run({ type: UPDATE_SESSION, sessionId, changes: { note: '부호 계산에서 자주 멈춤' } });
  assert.deepEqual(updated.value.events[0].fields, ['note']);
  assert.equal(byId(runner.state.sessions, sessionId).changeHistory[0].from, '');
  assert.equal(runner.state.sessions.length, 1);

  const unchanged = runner.run({ type: UPDATE_SESSION, sessionId, changes: { note: '부호 계산에서 자주 멈춤' } });
  assert.deepEqual(unchanged.value.events, []);
});

test('출석하지 않은 회기, 활동 시간이 없는 회기, 검토 확인 없는 일지는 확정할 수 없다', () => {
  const runner = createRunner();
  const absent = runner.run({ type: CREATE_SESSION, learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24', attendance: ATTENDANCE.ABSENT }).value.events[0].sessionId;
  const absentLog = runner.run({ type: SAVE_LOG_DRAFT, sessionId: absent, mentorText: '결석' }).value.events[0].logId;
  assert.equal(runner.run({ type: CONFIRM_LOG, logId: absentLog, reviewed: true }).error.code, ERROR_CODES.ATTENDANCE_NOT_ATTENDED);

  const noMinutes = attendedSession(runner, { activityMinutes: 0 });
  const noMinutesLog = runner.run({ type: SAVE_LOG_DRAFT, sessionId: noMinutes, mentorText: '내용' }).value.events[0].logId;
  assert.equal(runner.run({ type: CONFIRM_LOG, logId: noMinutesLog, reviewed: true }).error.code, ERROR_CODES.INVALID_ACTIVITY_MINUTES);

  const ok = attendedSession(runner);
  const okLog = runner.run({ type: SAVE_LOG_DRAFT, sessionId: ok, mentorText: '내용' }).value.events[0].logId;
  assert.equal(runner.run({ type: CONFIRM_LOG, logId: okLog }).error.code, ERROR_CODES.REVIEW_REQUIRED);

  const emptyLog = runner.run({ type: SAVE_LOG_DRAFT, sessionId: attendedSession(runner) }).value.events[0].logId;
  assert.equal(runner.run({ type: CONFIRM_LOG, logId: emptyLog, reviewed: true }).error.code, ERROR_CODES.EMPTY_LOG_TEXT);
});

test('초안은 월별 대장에서 빠진다', () => {
  const runner = createRunner();
  const sessionId = attendedSession(runner);
  runner.run({ type: SAVE_LOG_DRAFT, sessionId, mentorText: '초안' });
  const ledger = buildMonthlyLedger(runner.state, { month: '2026-10' }).value;
  assert.equal(ledger.sessionCount, 0);
  assert.equal(ledger.totalMinutes, 0);
});

test('같은 일지를 두 번 확정해도 대장에 한 번만 들어간다', () => {
  const runner = createRunner();
  const sessionId = attendedSession(runner, { activityMinutes: 50 });
  const logId = confirmedLog(runner, sessionId);
  assert.equal(runner.run({ type: CONFIRM_LOG, logId, reviewed: true }).error.code, ERROR_CODES.LOG_NOT_DRAFT);

  const ledger = buildMonthlyLedger(runner.state, { month: '2026-10' }).value;
  assert.equal(ledger.sessionCount, 1);
  assert.equal(ledger.totalMinutes, 50);
});

test('확정 후 수정은 새 개정본이 되고, 대장에는 최신 확정본 하나만 들어간다', () => {
  const runner = createRunner();
  const sessionId = attendedSession(runner, { activityMinutes: 60 });
  const firstLogId = confirmedLog(runner, sessionId, '1차 확정 내용');

  const revision = runner.run({ type: SAVE_LOG_DRAFT, sessionId });
  const secondLogId = revision.value.events[0].logId;
  const second = byId(runner.state.logs, secondLogId);
  assert.equal(second.revision, 2);
  assert.equal(second.replacesLogId, firstLogId);
  assert.equal(second.mentorText, '1차 확정 내용');

  // 새 개정본이 확정되기 전에는 이전 확정본이 유효하다
  assert.equal(buildMonthlyLedger(runner.state, { month: '2026-10' }).value.rows[0].logId, firstLogId);

  runner.run({ type: SAVE_LOG_DRAFT, sessionId, mentorText: '2차 수정 내용' });
  assert.equal(runner.run({ type: CONFIRM_LOG, logId: secondLogId, reviewed: true }).ok, true);

  const ledger = buildMonthlyLedger(runner.state, { month: '2026-10' }).value;
  assert.equal(ledger.sessionCount, 1);
  assert.equal(ledger.totalMinutes, 60);
  assert.equal(ledger.rows[0].content, '2차 수정 내용');
  assert.equal(byId(runner.state.logs, firstLogId).status, LOG_STATUSES.CONFIRMED);
  assert.equal(runner.state.logs.length, 2);

  const view = getSessionLogView(runner.state, sessionId);
  assert.equal(view.draft, null);
  assert.equal(view.latestConfirmed.id, secondLogId);
  assert.equal(view.revisions.length, 2);
});

test('월 경계 회기는 한국 날짜 기준 달에 한 번만 집계된다', () => {
  const localDate = toSeoulLocalDate(new Date('2026-10-31T15:30:00.000Z'));
  assert.equal(localDate, '2026-11-01');

  const runner = createRunner();
  confirmedLog(runner, attendedSession(runner, { localDate, activityMinutes: 40 }));
  assert.equal(buildMonthlyLedger(runner.state, { month: '2026-10' }).value.sessionCount, 0);
  assert.equal(buildMonthlyLedger(runner.state, { month: '2026-11' }).value.totalMinutes, 40);
});

test('대장을 표 붙여넣기용 텍스트로 만든다', () => {
  const runner = createRunner();
  confirmedLog(runner, attendedSession(runner, { activityMinutes: 30 }), '이항\t연습\n복습');
  const tsv = formatLedgerAsTsv(buildMonthlyLedger(runner.state, { month: '2026-10' }).value);
  const lines = tsv.split('\n');
  assert.equal(lines[0], '날짜\t멘티\t활동 시간(분)\t내용\t일지 참조');
  assert.match(lines[1], /^2026-10-24\t하늘\t30\t이항 연습 복습\tlog-\d+ \(개정 1\)$/);
  assert.equal(lines[2], '합계\t1회\t30\t\t');
});

test('알 수 없는 명령과 잘못된 월은 거부한다', () => {
  const runner = createRunner();
  assert.equal(runner.run({ type: 'NOPE' }).error.code, ERROR_CODES.UNKNOWN_COMMAND);
  assert.equal(buildMonthlyLedger(runner.state, { month: '2026-13' }).error.code, ERROR_CODES.INVALID_COMMAND);
});
