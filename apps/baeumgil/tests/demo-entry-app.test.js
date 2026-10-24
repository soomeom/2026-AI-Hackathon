import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCatalogParts } from '../public/src/content/catalog.js';
import { makeCatalog } from './fixtures.js';
import { createDemoState, createStore } from '../public/src/state/store.js';
import { saveSession, confirmLog } from '../public/src/mentoring/logs.js';
import { STORAGE_KEY } from '../public/src/state/persistence.js';
import { DEMO_SESSION_KEY } from '../public/src/state/demo-session.js';
import {setupAI,recordFor} from './practice-state-fixtures.js';
import {catalog as goalCatalog} from './practice-fixtures.js';
import {acceptAIPractice,presentAIPractice,submitAIPractice,closeAIPractice} from '../public/src/learning/ai-practice.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
};
const click = (node, dataset = {}) => {
  const event = { target: { closest: () => ({ dataset, disabled: false }) } };
  if (node.onclick) node.onclick(event);
  for (const listener of node.listeners.click ?? []) listener(event);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const enterMath = (h, role) => {
  click(h.app, { enterRole: role });
  // 보호자는 과목 선택 없이 바로 학습 소식으로 들어간다
  if (role === 'guardian') { assert.doesNotMatch(h.app.innerHTML, /어떤 과목을 함께 배울까요/); assert.equal(h.node('change-subject').hidden, true); return; }
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  click(h.app, { subjectId: 'math' });
};
let bootId = 0;

test('clicking the current sessions sidebar never replaces an unsaved form',async t=>{
 const h=await boot(t,{saved:seeded()});enterMath(h,'mentor');click(h.node('mentor-nav-sessions'));
 let html=h.app.innerHTML,writes=0;Object.defineProperty(h.app,'innerHTML',{get:()=>html,set:value=>{writes++;html=value;},configurable:true});
 h.app.fields=[{tagName:'TEXTAREA',value:'저장 전 회기 메모',defaultValue:''}];
 const before=h.local.getItem(STORAGE_KEY);click(h.node('mentor-nav-sessions'));
 assert.equal(writes,0);assert.equal(h.app.fields[0].value,'저장 전 회기 메모');assert.equal(h.local.getItem(STORAGE_KEY),before);
});

test('unchanged visible log can be reconfirmed after session edits without losing old versions',async t=>{
 const original=seeded(),updated=saveSession(original,{...original.sessions[0],actualMinutes:55});
 const h=await boot(t,{saved:updated});enterMath(h,'mentor');click(h.node('mentor-nav-sessions'));
 assert.match(h.app.innerHTML,/기존 확정 일지/);h.app.oninput({target:{id:'log-reviewed',checked:true}});click(h.app,{action:'confirm-log'});
 assert.equal(h.saved().logs.length,2);assert.deepEqual(h.saved().logs[0],original.logs[0]);assert.equal(h.saved().logs[1].content,'기존 확정 일지');assert.equal(h.saved().logs[1].sessionSnapshot.actualMinutes,55);
 h.app.oninput({target:{id:'log-content',value:''}});h.app.oninput({target:{id:'log-reviewed',checked:true}});click(h.app,{action:'confirm-log'});
 assert.match(h.app.innerHTML,/일지 내용을 적어 주세요/);assert.equal(h.saved().logs.length,2);
});

test('empty or malformed ledger month leaves the current month and form usable',async t=>{
 const h=await boot(t,{saved:seeded()});enterMath(h,'mentor');click(h.node('mentor-nav-sessions'));
 const before=h.app.innerHTML,stored=h.local.getItem(STORAGE_KEY);
 for(const value of ['', '2026-13','bad']){
  assert.doesNotThrow(()=>h.app.onchange({target:{id:'ledger-month',value}}));assert.equal(h.app.innerHTML,before);
 }
 h.app.onchange({target:{id:'ledger-month',value:'2026-10'}});assert.match(h.app.innerHTML,/기존 확정 일지/);assert.equal(h.local.getItem(STORAGE_KEY),stored);
});

test('weekly shared goal appears on mentor home without changing existing records',async t=>{
 const original=seeded(),h=await boot(t,{saved:original});enterMath(h,'mentor');
 assert.match(h.app.innerHTML,/이번 주 함께 목표/);
 assert.match(h.app.innerHTML,/보충 개념/);
 assert.match(h.app.innerHTML,/함께한 수업/);
 assert.deepEqual(h.saved().attempts,original.attempts);
 assert.deepEqual(h.saved().sessions,original.sessions);
});

test('mentor can encourage before goal completion and learner sees it after role change and reload',async t=>{
 const state=setupAI().getState(),h=await boot(t,{saved:state,catalog:goalCatalog});enterMath(h,'mentor');
 assert.doesNotMatch(h.app.innerHTML,/✓ 함께 목표 완료/);
 assert.match(h.app.innerHTML,/data-action="share-goal-message"/);
 h.node('weekly-goal-message').value='   ';click(h.app,{action:'share-goal-message'});
 assert.match(h.app.innerHTML,/role="alert"/);
 assert.match(h.app.innerHTML,/<details[^>]*class="weekly-goal-compose"[^>]*\bopen\b/);
 assert.doesNotMatch(h.app.innerHTML,/목표를 완료한 뒤/);
 assert.deepEqual(h.saved(),state);
 h.node('weekly-goal-message').value='어려운 개념은 함께 다시 살펴봐요.';
 click(h.app,{action:'share-goal-message'});
 assert.equal(h.saved().weeklyGoalMessages.length,1);
 click(h.node('change-role'));enterMath(h,'learner');
 assert.match(h.app.innerHTML,/어려운 개념은 함께 다시 살펴봐요/);
 const reloaded=await boot(t,{local:h.local,tab:h.tab,catalog:goalCatalog});
 assert.match(reloaded.app.innerHTML,/어려운 개념은 함께 다시 살펴봐요/);
 const {weeklyGoalMessages,revision,...after}=reloaded.saved();
 const {revision:oldRevision,...before}=state;
 assert.deepEqual(after,before);
 assert.equal(weeklyGoalMessages.length,1);
});

test('mentor encouragement reaches learner results after role change and reload even with an old role field',async t=>{
 let state=setupAI().getState();const at=new Date().toISOString(),localDate=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 for(const [i,concept] of ['roadmap-like-terms','roadmap-linear-sum'].entries()){
  const r=recordFor(state,concept,`goal-ui-${i}`);state=presentAIPractice(acceptAIPractice(state,{record:r},{catalog:goalCatalog}),{id:r.id,at});
  state=submitAIPractice(state,{id:r.id,submissionId:`goal-ui-answer-${i}`,choiceId:'option-1',at},{catalog:goalCatalog});
 }
 state=saveSession(closeAIPractice(state),{id:'goal-session',learnerId:state.learnerId,mentorId:state.mentorId,localDate,attendance:'attended',actualMinutes:30});state.activeRole='mentee';
 const h=await boot(t,{saved:state,catalog:goalCatalog});enterMath(h,'mentor');
 assert.match(h.app.innerHTML,/함께 목표 완료/);h.node('weekly-goal-message').value='혼자 애쓰지 않고 함께 해내서 좋아요!';
 click(h.app,{action:'share-goal-message'});assert.equal(h.saved().weeklyGoalMessages.length,1);
 click(h.node('change-role'));enterMath(h,'learner');assert.match(h.app.innerHTML,/혼자 애쓰지 않고 함께 해내서 좋아요!/);
 const reloaded=await boot(t,{local:h.local,tab:h.tab,catalog:goalCatalog});assert.match(reloaded.app.innerHTML,/멘토의 응원/);
 assert.deepEqual(reloaded.saved().initialAssessments,state.initialAssessments);assert.deepEqual(reloaded.saved().sessions,state.sessions);
 assert.equal(reloaded.saved().guardianMessages,undefined);
});

test('completed lesson results resume pending work or open the roadmap while preserving evidence and logs',async t=>{
  const store=createStore({initialState:seeded(),catalog:makeCatalog()});
  const first=store.getState().paths[0];
  store.dispatch({type:'MENTOR_OVERRIDE',pathId:first.id,mentorId:store.getState().mentorId,targetStage:'completed',reason:'수업에서 확인 후 종료'});
  const finished=structuredClone(store.getState());
  const second=store.assignQuestion({questionId:'q-rat-1'});
  const original=store.getState();
  const h=await boot(t,{saved:original});enterMath(h,'learner');await tick();
  click(h.app,{path:first.id});
  assert.match(h.app.innerHTML,/오늘의 배움길을 마쳤어요/);
  assert.doesNotMatch(h.app.innerHTML,/class="choices/);
  assert.match(h.app.innerHTML,/data-result-path=/);
  click(h.app,{resultPath:second});await tick();
  assert.match(h.app.innerHTML,/제출하기/);
  assert.deepEqual(h.saved().attempts,original.attempts);
  assert.deepEqual(h.saved().logs,original.logs);
  assert.deepEqual(h.saved().paths.find(p=>p.id===first.id),original.paths.find(p=>p.id===first.id));
  const done=await boot(t,{saved:finished});enterMath(done,'learner');
  assert.match(done.app.innerHTML,/data-action="result-roadmap"/);
  click(done.app,{action:'result-roadmap'});
  assert.match(done.app.innerHTML,/학습 로드맵/);
  assert.match(done.app.innerHTML,/첫 수준 확인으로 이동/);
  assert.deepEqual(done.saved().logs,finished.logs);
});

test('focused results reach practice and mentor planning without rewriting original diagnosis or old logs',async t=>{
  const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(n=>JSON.parse(readFileSync(new URL(`../public/src/content/${n}.json`,import.meta.url),'utf8'))));
  const h=await boot(t,{catalog});enterMath(h,'learner');click(h.app,{initialAction:'start'});
  for(let i=0;i<3;i++){const id=h.saved().initialAssessments[0].diagnostic.currentId;click(h.app,{initialAction:'unknown',initialQuestion:id});await tick();}
  click(h.app,{initialAction:'pause'});
  assert.match(h.app.innerHTML,/다음 학습/);assert.doesNotMatch(h.app.innerHTML,/class="roadmap-card/);
  const original=h.saved().initialAssessments[0].diagnostic;
  click(h.app,{initialAction:'next-practice'});
  assert.match(h.app.innerHTML,/연습 답 확인/);
  click(h.app,{roadmapAction:'close'});
  assert.match(h.app.innerHTML,/개념 관계 지도/);
  click(h.node('change-role'));enterMath(h,'mentor');
  assert.doesNotMatch(h.app.innerHTML,/initial-concept|assign-select|roadmap-card/);
  click(h.app,{goto:'planning'});assert.match(h.app.innerHTML,/initial-concept/);
  click(h.app,{initialAction:'plan'});
  assert.equal(h.saved().startingPoints.length,1);
  click(h.node('change-role'));enterMath(h,'learner');await tick();
  assert.match(h.app.innerHTML,/제출하기/);
  assert.deepEqual(h.saved().initialAssessments[0].diagnostic,original);
});

test('dedicated roadmap menus explore without writes and share practice across roles and refresh',async t=>{
  const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(name=>JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`,import.meta.url),'utf8'))));
  const h=await boot(t,{catalog}); enterMath(h,'learner');
  click(h.node('learner-roadmap'));
  assert.match(h.app.innerHTML,/개념 관계 지도/);
  assert.equal(h.saved(),null);
  assert.doesNotMatch(h.app.innerHTML,/data-roadmap-action="open"/);
  click(h.app,{mapAction:'assessment'});assert.equal(h.focused(),'app');click(h.app,{initialAction:'start'});
  for(let i=0;i<3;i++){const id=h.saved().initialAssessments[0].diagnostic.currentId;click(h.app,{initialAction:'unknown',initialQuestion:id});await tick();}
  click(h.node('learner-roadmap'));
  assert.match(h.app.innerHTML,/진단 진행 중/);
  assert.doesNotMatch(h.app.innerHTML,/data-roadmap-action="open"/);
  click(h.node('learner-learning'));click(h.app,{initialAction:'pause'});
  click(h.node('learner-roadmap'));
  const before=h.saved();
  click(h.app,{mapAction:'scope',mapValue:'all'});
  click(h.app,{mapAction:'select',mapNode:'algebra:roadmap-like-terms'});
  assert.match(h.app.innerHTML,/해설과 보충 문제 풀기/);
  assert.deepEqual(h.saved(),before);
  click(h.app,{roadmapAction:'open',roadmapCard:'algebra:roadmap-like-terms',roadmapQuestion:'roadmap-like-terms'});
  const round=h.saved().initialAssessments[0].roadmapPractice.roundId;
  click(h.app,{roadmapAction:'choice',roadmapChoice:'a',roadmapRound:round});
  click(h.app,{roadmapAction:'submit',roadmapRound:round});
  click(h.node('change-role'));enterMath(h,'mentor');
  click(h.app,{tab:'roadmap'});
  assert.match(h.app.innerHTML,/문제·정답·해설 보기/);
  assert.match(h.app.innerHTML,/학생 기록: 맞힘/);
  assert.doesNotMatch(h.app.innerHTML,/data-roadmap-action="open"/);
  click(h.app,{roadmapAction:'close'});
  assert.match(h.app.innerHTML,/개념 관계 지도/);
  assert.match(h.app.innerHTML,/class="relation-map"/,'멘토는 관계 지도가 기본');
  assert.match(h.app.innerHTML,/보충 연습 문제 <small>1\/2/);
  assert.doesNotMatch(h.app.innerHTML,/단계별 카드/);
  click(h.app,{mapAction:'zoom',mapValue:'on'});
  assert.match(h.app.innerHTML,/data-map-value="on" aria-pressed="true"/);
  click(h.app,{mapAction:'view',mapValue:'map'});
  assert.doesNotMatch(h.app.innerHTML,/class="relation-map"/);
  const restored=await boot(t,{catalog,local:h.local,tab:h.tab});
  click(restored.app,{tab:'roadmap'});
  assert.match(restored.app.innerHTML,/개념 관계 지도/);
  assert.deepEqual(restored.saved().initialAssessments[0].diagnostic,before.initialAssessments[0].diagnostic);
  assert.equal(restored.saved().initialAssessments[0].roadmapPractice.attempts.length,1);
});

test('roadmap navigation pauses the regular learning timer and retains session records',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-24T12:00:00Z')});
  const initial=seeded(),h=await boot(t,{saved:initial});enterMath(h,'learner');await tick();
  t.mock.timers.tick(10000);click(h.node('learner-roadmap'));
  assert.match(h.app.innerHTML,/로드맵/);
  assert.equal(h.saved().paths[0].visible,false);
  t.mock.timers.tick(60000);click(h.node('learner-learning'));await tick();
  t.mock.timers.tick(5000);click(h.app,{choice:'c'});click(h.app,{action:'submit'});
  assert.equal(h.saved().attempts[0].activeMs,15000);
  assert.deepEqual(h.saved().sessions,initial.sessions);assert.deepEqual(h.saved().logs,initial.logs);
});

test('mentor roadmap exit protects unsaved session input and retains the in-memory log draft',async t=>{
  let allow=false;
  const h=await boot(t,{saved:seeded(),confirm:()=>allow});enterMath(h,'mentor');click(h.app,{tab:'sessions'});
  h.app.oninput({target:{id:'log-content',value:'유지할 초안'}});
  h.app.fields=[{tagName:'TEXTAREA',value:'저장 전 메모',defaultValue:''}];
  click(h.app,{tab:'roadmap'});assert.match(h.app.innerHTML,/회기 목록/);
  allow=true;click(h.app,{tab:'roadmap'});assert.match(h.app.innerHTML,/로드맵/);
  h.app.fields=[];click(h.app,{tab:'sessions'});assert.match(h.app.innerHTML,/유지할 초안/);
});

test('roadmap card practice survives refresh, role and subject changes without rewriting diagnostic history',async t=>{
  const read=name=>JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`,import.meta.url),'utf8'));
  const catalog=mergeCatalogParts(['questions','concepts','routes','review','exam-bank'].map(read));
  const h=await boot(t,{catalog});enterMath(h,'learner');click(h.app,{initialAction:'start'});await tick();
  for(let i=0;i<3;i++){const id=h.saved().initialAssessments[0].diagnostic.currentId;click(h.app,{initialAction:'unknown',initialQuestion:id});await tick();}
  click(h.app,{initialAction:'pause'});
  assert.match(h.app.innerHTML,/맞춤형 학습 로드맵/);
  const diagnostic=h.saved().initialAssessments[0].diagnostic;
  const cardId='algebra:roadmap-like-terms',questionId='roadmap-like-terms';
  click(h.app,{roadmapAction:'open',roadmapCard:cardId,roadmapQuestion:questionId});
  assert.match(h.app.innerHTML,/연습 답 확인/);
  const round=h.saved().initialAssessments[0].roadmapPractice.roundId;
  click(h.app,{roadmapAction:'choice',roadmapChoice:'a',roadmapRound:round});
  click(h.app,{roadmapAction:'submit',roadmapRound:round});
  assert.match(h.app.innerHTML,/맞혔어요/);
  const restored=await boot(t,{catalog,local:h.local,tab:h.tab});
  assert.match(restored.app.innerHTML,/맞혔어요/);
  click(restored.node('change-subject'));click(restored.app,{subjectId:'math'});
  click(restored.node('change-role'));enterMath(restored,'mentor');
  click(restored.app,{tab:'roadmap'});
  assert.match(restored.app.innerHTML,/문제·정답·해설 보기/);
  assert.match(restored.app.innerHTML,/학생 기록: 맞힘/);
  assert.deepEqual(restored.saved().initialAssessments[0].diagnostic,diagnostic);
  assert.equal(restored.saved().initialAssessments[0].roadmapPractice.attempts.length,1);
  click(restored.app,{roadmapAction:'close'});
  click(restored.app,{mapAction:'view',mapValue:'relation'});assert.match(restored.app.innerHTML,/보충 연습 문제 <small>1\/2/);
});

// DOM 경계만 대체하고 app.js와 실제 저장·학습·화면 코드를 실행한다.
async function boot(t, { saved, local = memoryStorage(), tab = memoryStorage(), confirm = () => true, catalog = makeCatalog(), practiceRequest = null } = {}) {
  const nodes = new Map();
  let focused = null;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, innerHTML: '', textContent: '', hidden: false, value: '', listeners: {}, fields: [],
      classes: new Set(), attrs: {},
      classList: { toggle(name,value) { const n=nodes.get(id);const on=value??!n.classes.has(name);if(on)n.classes.add(name);else n.classes.delete(name); }, contains(name){return nodes.get(id).classes.has(name);} }, setAttribute(name,value) {this.attrs[name]=value;}, focus() { focused = id; },
      addEventListener(event, handler) { (this.listeners[event] ??= []).push(handler); },
      querySelectorAll() { return this.fields; }, querySelector(selector) { return node(selector.slice(1)); },
    });
    return nodes.get(id);
  };
  if (saved) local.setItem(STORAGE_KEY, JSON.stringify(saved));
  const original = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = { hidden: false, documentElement:node('html'), getElementById: node, querySelector: () => node('legacy-roles'), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { localStorage: local, sessionStorage: tab, confirm, addEventListener() {}, location: { reload() {} } };
  globalThis.fetch = async (url,options) => ({ ok: true, json: async () => url === '/api/practice' ? practiceRequest(JSON.parse(options.body)) : url === '/api/health'
    ? { ai: { configured: Boolean(practiceRequest) } }
    : url.includes('exam-bank') ? {} : catalog });
  t.after(() => { Object.assign(globalThis, original); });
  await import(`../public/app.js?demo-entry-test=${++bootId}`);
  await tick();
  return { node, app: node('app'), local, tab, focused:()=>focused, saved: () => JSON.parse(local.getItem(STORAGE_KEY)) };
}

function seeded() {
  const store = createStore({ initialState: createDemoState(), catalog: makeCatalog() });
  store.assignQuestion({ questionId: 'q-eq-1' });
  let state = saveSession(store.getState(), { id: 'session-1', learnerId: 'learner-1', mentorId: 'mentor-1', localDate: '2026-10-24', attendance: 'attended', actualMinutes: 40, pathIds: [], note: '기존 회기' });
  return confirmLog(state, { sessionId: 'session-1', content: '기존 확정 일지', reviewed: true });
}

test('real app starts at entry, role changes retain a submitted answer and existing confirmed logs', async t => {
  const initial = seeded();
  const h = await boot(t, { saved: initial });
  assert.match(h.app.innerHTML, /멘토로 바로 들어가기/);
  enterMath(h, 'learner'); await tick();
  assert.match(h.app.innerHTML, /제출하기/);
  assert.doesNotMatch(h.app.innerHTML, /첫 수준 확인 시작/);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts.length, 1);
  click(h.node('change-role'));
  assert.match(h.app.innerHTML, /멘토로 바로 들어가기/);
  assert.equal(h.saved().paths[0].visible, false);
  enterMath(h, 'mentor');
  assert.match(h.app.innerHTML, /오늘 확인할 것/);
  assert.equal(h.saved().attempts[0].choiceId, 'c');
  assert.deepEqual(h.saved().logs, initial.logs);
  assert.deepEqual(h.saved().sessions, initial.sessions);
  assert.match(h.node('current-profile').textContent, /멘토/);
  click(h.node('change-role')); enterMath(h, 'learner');
  assert.equal(h.saved().attempts.length, 1);
});

test('guardian entry and refresh are read only, preserve answers/logs, and show only explicitly shared mentor text',async t=>{
 const initial=seeded();const h=await boot(t,{saved:initial});
 enterMath(h,'mentor');h.node('guardian-message').value='이번 주에는 부호 계산을 함께 확인해 주세요.';
 click(h.app,{action:'share-guardian-message'});
 assert.equal(h.saved().guardianMessages.at(-1).text,'이번 주에는 부호 계산을 함께 확인해 주세요.');
 click(h.node('change-role'));enterMath(h,'guardian');
 assert.match(h.app.innerHTML,/최근 7일/);assert.match(h.app.innerHTML,/부호 계산/);
 assert.doesNotMatch(h.app.innerHTML,/기존 확정 일지|기존 회기|data-action="submit"|data-ai=/);
 assert.equal(h.node('reset').hidden,true);assert.equal(h.node('mentor-navigation').hidden,true);
 assert.equal(h.node('guardian-navigation').hidden,false);assert.match(h.node('current-profile').textContent,/보호자/);
 const before=h.local.getItem(STORAGE_KEY);click(h.node('reset'));click(h.app,{action:'submit'});
 const fresh=await boot(t,{local:h.local,tab:h.tab});assert.match(fresh.app.innerHTML,/학습 소식/);
 assert.equal(fresh.local.getItem(STORAGE_KEY),before);assert.deepEqual(fresh.saved().logs,initial.logs);
 click(fresh.node('change-role'));enterMath(fresh,'learner');await tick();assert.match(fresh.app.innerHTML,/제출하기/);
});

test('large text never rerenders a dirty form or mutates learning records and survives role changes and reload',async t=>{
 const h=await boot(t,{saved:seeded()});enterMath(h,'mentor');click(h.app,{goto:'sessions'});
 h.app.fields=[{tagName:'TEXTAREA',value:'입력 중',defaultValue:''}];const fields=h.app.fields,html=h.app.innerHTML,before=h.local.getItem(STORAGE_KEY);
 click(h.node('large-text'));assert.equal(h.node('html').classes.has('large-text'),true);
 assert.equal(h.node('large-text').attrs['aria-pressed'],'true');assert.equal(h.app.innerHTML,html);assert.equal(h.app.fields,fields);assert.equal(h.local.getItem(STORAGE_KEY),before);
 h.app.fields=[];click(h.node('change-role'));enterMath(h,'guardian');assert.equal(h.node('html').classes.has('large-text'),true);
 const fresh=await boot(t,{local:h.local,tab:h.tab});assert.equal(fresh.node('html').classes.has('large-text'),true);
 click(fresh.node('large-text'));assert.equal(fresh.node('html').classes.has('large-text'),false);
});

test('refresh restores a tab role, returning to entry removes it, and another tab starts at entry', async t => {
  const local = memoryStorage(), tab = memoryStorage();
  const first = await boot(t, { local, tab });
  enterMath(first, 'mentor');
  const refreshed = await boot(t, { local, tab });
  assert.match(refreshed.app.innerHTML, /오늘 확인할 것/);
  const other = await boot(t, { local });
  assert.match(other.app.innerHTML, /멘토로 바로 들어가기/);
  click(refreshed.node('change-role'));
  const exited = await boot(t, { local, tab });
  assert.match(exited.app.innerHTML, /멘토로 바로 들어가기/);
});

test('canceling a dirty form exit keeps the mentor screen; accepted exit preserves log draft', async t => {
  let allowExit = false, prompts = 0;
  const h = await boot(t, { saved: seeded(), confirm: () => { prompts++; return allowExit; } });
  enterMath(h, 'mentor'); click(h.app, { goto: 'sessions' });
  h.app.oninput({ target: { id: 'log-content', value: '작성 중인 일지 초안' } });
  h.app.fields = [{ tagName: 'TEXTAREA', value: '저장 전 회기 메모', defaultValue: '' }];
  click(h.node('change-role'));
  assert.equal(prompts, 1);
  assert.match(h.app.innerHTML, /회기 목록/);
  allowExit = true; click(h.node('change-role'));
  assert.match(h.app.innerHTML, /멘토로 바로 들어가기/);
  h.app.fields = [];
  enterMath(h, 'mentor'); click(h.app, { goto: 'sessions' });
  assert.match(h.app.innerHTML, /작성 중인 일지 초안/);
  assert.equal(h.saved().logs[0].content, '기존 확정 일지');
});

test('learner solving time excludes time on entry, mentor and guardian screens', async t => {
  const initial = seeded();
  const start = Date.parse('2026-10-24T10:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const h = await boot(t, { saved: initial });
  enterMath(h, 'learner'); await tick();
  t.mock.timers.tick(10000);
  click(h.node('change-role'));
  t.mock.timers.tick(60000);
  enterMath(h, 'mentor');
  t.mock.timers.tick(60000);
  click(h.node('change-role')); enterMath(h, 'guardian');
  t.mock.timers.tick(120000);
  click(h.node('change-role')); enterMath(h, 'learner'); await tick();
  t.mock.timers.tick(5000);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts[0].activeMs, 15000);
});

test('adaptive assessment survives role changes and refresh, then mentor assignment opens learner practice', async t => {
  const catalog = mergeCatalogParts(['questions', 'concepts', 'routes', 'review', 'exam-bank'].map(name =>
    JSON.parse(readFileSync(new URL(`../public/src/content/${name}.json`, import.meta.url), 'utf8'))));
  const h = await boot(t, { catalog });
  enterMath(h, 'learner');
  assert.match(h.app.innerHTML, /6개 영역/);
  click(h.app, { initialAction: 'start' });
  const questionId = h.saved().initialAssessments[0].diagnostic.currentId;
  click(h.app, { initialAction: 'unknown', initialQuestion: questionId });
  const assessment = h.saved().initialAssessments[0];
  assert.equal(assessment.diagnostic.attempts.length, 1);
  click(h.node('change-subject'));
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  assert.deepEqual(h.saved().initialAssessments[0], assessment);
  click(h.app, { subjectId: 'math' });
  click(h.node('change-role')); enterMath(h, 'mentor');
  assert.match(h.app.innerHTML, /1문제 응답/);
  click(h.node('change-role')); enterMath(h, 'learner');
  assert.deepEqual(h.saved().initialAssessments[0], assessment);
  const restored = await boot(t, { catalog, local: h.local, tab: h.tab });
  assert.match(restored.app.innerHTML, /2번째 문제/);
  assert.deepEqual(restored.saved().initialAssessments[0], assessment);
  click(restored.app, { initialAction: 'pause' });
  const paused = restored.saved().initialAssessments[0];
  click(restored.node('change-role')); enterMath(restored, 'mentor');
  assert.match(restored.app.innerHTML, /첫 수준 확인 결과/);
  click(restored.app, { tab: 'planning' });
  assert.match(restored.app.innerHTML, /initial-concept/);
  click(restored.app, { initialAction: 'plan' });
  assert.equal(restored.saved().paths.length, 1);
  click(restored.node('change-role')); enterMath(restored, 'learner'); await tick();
  assert.match(restored.app.innerHTML, /제출하기/);
  assert.deepEqual(restored.saved().initialAssessments[0], paused);
});

test('subject selection gates exposure and unsupported clicks; math return retains records and excludes idle time', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-24T12:00:00Z') });
  const initial = seeded();
  const h = await boot(t, { saved: initial });
  click(h.app, { enterRole: 'learner' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  assert.equal(h.node('reset').hidden, true);
  assert.equal(h.saved().exposures.length, initial.exposures.length);
  click(h.app, { subjectId: 'english' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  t.mock.timers.tick(60000);
  click(h.app, { subjectId: 'math' }); await tick();
  assert.match(h.node('current-profile').textContent, /수학/);
  t.mock.timers.tick(10000);
  click(h.node('reset')); // only first confirmation
  click(h.node('change-subject'));
  assert.equal(h.saved().paths[0].visible, false);
  assert.equal(h.node('reset').textContent, '시연 초기화');
  t.mock.timers.tick(60000);
  click(h.app, { subjectId: 'math' }); await tick();
  t.mock.timers.tick(5000);
  click(h.app, { choice: 'c' }); click(h.app, { action: 'submit' });
  assert.equal(h.saved().attempts[0].activeMs, 15000);
  assert.deepEqual(h.saved().sessions, initial.sessions);
  assert.deepEqual(h.saved().logs, initial.logs);
});

test('old role-only sessions restore subject selection and subject exit remains there after refresh', async t => {
  const tab = memoryStorage(), local = memoryStorage();
  tab.setItem(DEMO_SESSION_KEY, JSON.stringify({version:1,role:'mentor'}));
  const h = await boot(t, { tab, local });
  assert.match(h.app.innerHTML, /수학 지도 시작/);
  assert.equal(h.saved(), null);
  click(h.app, { subjectId:'math' });
  assert.match(h.app.innerHTML, /오늘 확인할 것/);
  click(h.node('change-subject'));
  const restored = await boot(t, { tab, local });
  assert.match(restored.app.innerHTML, /수학 지도 시작/);
  assert.equal(restored.node('change-subject').hidden, true);
});

test('subject exit cancel keeps session input and accepted exit retains the log draft', async t => {
  let allow = false;
  const h = await boot(t, { saved:seeded(), confirm:()=>allow });
  enterMath(h,'mentor'); click(h.app,{goto:'sessions'});
  h.app.oninput({target:{id:'log-content',value:'과목 이동 전 일지 초안'}});
  h.app.fields = [{tagName:'TEXTAREA',value:'미저장 회기',defaultValue:''}];
  const before = h.tab.getItem(DEMO_SESSION_KEY);
  click(h.node('change-subject'));
  assert.equal(h.tab.getItem(DEMO_SESSION_KEY), before);
  assert.equal(h.app.fields[0].value,'미저장 회기');
  assert.match(h.app.innerHTML,/회기 목록/);
  allow = true; click(h.node('change-subject'));
  assert.match(h.app.innerHTML,/수학 지도 시작/);
  h.app.fields = []; click(h.app,{subjectId:'math'}); click(h.app,{goto:'sessions'});
  assert.match(h.app.innerHTML,/과목 이동 전 일지 초안/);
  assert.equal(h.saved().logs[0].content,'기존 확정 일지');
});

test('left navigation appears only in the workspace, moves between mentor pages and remembers the collapsed state', async t => {
  let allow = false;
  const h = await boot(t, { saved: seeded(), confirm: () => allow });
  assert.equal(h.node('sidenav').hidden, true);
  enterMath(h, 'mentor');
  assert.equal(h.node('sidenav').hidden, false);
  assert.equal(h.node('mentor-navigation').hidden, false);
  assert.equal(h.node('learner-navigation').hidden, true);
  click(h.node('mentor-nav-roadmap')); assert.match(h.app.innerHTML, /student-bar-page">로드맵/);
  click(h.node('mentor-nav-sessions')); assert.match(h.app.innerHTML, /회기 목록/);
  h.app.fields = [{ tagName: 'TEXTAREA', value: '저장 전 메모', defaultValue: '' }];
  click(h.node('mentor-nav-planning')); assert.match(h.app.innerHTML, /회기 목록/, '저장 안 한 입력이 있으면 확인 후에만 이동');
  allow = true; click(h.node('mentor-nav-planning')); assert.doesNotMatch(h.app.innerHTML, /회기 목록/);
  h.app.fields = [];
  click(h.node('sidenav-toggle'));
  assert.equal(h.local.getItem('baeumgil.navCollapsed'), '1');
  click(h.node('change-role')); enterMath(h, 'learner');
  assert.equal(h.node('learner-navigation').hidden, false);
  assert.equal(h.node('mentor-navigation').hidden, true);
  click(h.node('learner-roadmap')); assert.match(h.app.innerHTML, /학습 로드맵/);
  click(h.node('sidenav-toggle'));
  assert.equal(h.local.getItem('baeumgil.navCollapsed'), '0');
});


test('real app AI practice persists draft/answer, reaches mentor and ignores a late response after role change',async t=>{
  const {catalog,sample}=await import('./practice-fixtures.js');
  const {setupAI,recordFor}=await import('./practice-state-fixtures.js');
  const {validateLinearPractice}=await import('../public/src/learning/linear-practice.js');
  const state=setupAI().getState(),r=recordFor(state),original=structuredClone(state.initialAssessments);
  let calls=0;
  const practiceRequest=async input=>{calls++;return {status:'ok',requestId:input.requestId,inputRevision:input.inputRevision,assessmentId:input.assessmentId,cardId:input.cardId,...validateLinearPractice(sample(input.conceptId)),model:'test'};};
  const h=await boot(t,{catalog,saved:state,practiceRequest});enterMath(h,'learner');
  click(h.app,{roadmapAction:'open',roadmapCard:r.cardId,roadmapQuestion:r.baseQuestionId});await tick();
  assert.match(h.app.innerHTML,/정답 검증 완료/);assert.equal(calls,1);
  const id=h.saved().activeGeneratedPracticeId;
  click(h.app,{aiPractice:'choice',practiceId:id,choiceId:'option-2'});
  const fresh=await boot(t,{catalog,local:h.local,tab:h.tab,practiceRequest});
  assert.match(fresh.app.innerHTML,/정답 검증 완료/);assert.equal(fresh.saved().generatedPractice[0].draftChoiceId,'option-2');assert.equal(calls,1);
  click(fresh.app,{aiPractice:'submit',practiceId:id});assert.equal(fresh.saved().generatedPractice[0].attempts[0].result,'incorrect');
  click(fresh.node('change-role'));enterMath(fresh,'mentor');assert.match(fresh.app.innerHTML,/AI 추가 연습/);assert.match(fresh.app.innerHTML,/다음 수업/);
  assert.deepEqual(fresh.saved().initialAssessments,original);
  click(fresh.node('change-role'));enterMath(fresh,'learner');
  let resolve;
  globalThis.fetch=async(url,options)=>({ok:true,json:()=>new Promise(done=>{resolve=()=>done(practiceRequest(JSON.parse(options.body)));})});
  const other=recordFor(state,'roadmap-like-terms');
  click(fresh.app,{roadmapAction:'open',roadmapCard:other.cardId,roadmapQuestion:other.baseQuestionId});await tick();
  assert.match(fresh.app.innerHTML,/준비 중/);click(fresh.node('change-role'));resolve();await tick();await tick();
  assert.equal(fresh.saved().generatedPractice.length,1);assert.match(fresh.app.innerHTML,/멘토로 바로 들어가기/);
});

test('question hints fall back safely, restore three levels, and mark roadmap answers as assisted',async t=>{
 const {catalog}=await import('./practice-fixtures.js'),{setupAI}=await import('./practice-state-fixtures.js');
 const initial=setupAI().getState(),h=await boot(t,{catalog,saved:initial});enterMath(h,'learner');
 click(h.node('learner-roadmap'));
 click(h.app,{roadmapAction:'open',roadmapCard:'algebra:roadmap-like-terms',roadmapQuestion:'roadmap-like-terms'});await tick();
 assert.match(h.app.innerHTML,/힌트 받기/);
 click(h.app,{hintAction:'ask'});await tick();assert.equal(h.saved().hintUsage.length,1);assert.match(h.app.innerHTML,/기본 힌트/);
 const fresh=await boot(t,{catalog,local:h.local,tab:h.tab});assert.match(fresh.app.innerHTML,/질문 1/);
 for(let i=0;i<2;i++){click(fresh.app,{hintAction:'ask'});await tick();}
 assert.equal(fresh.saved().hintUsage.length,3);assert.match(fresh.app.innerHTML,/질문 3/);
 const round=fresh.saved().initialAssessments[0].roadmapPractice.roundId;
 click(fresh.app,{roadmapAction:'choice',roadmapChoice:'a',roadmapRound:round});click(fresh.app,{roadmapAction:'submit',roadmapRound:round});
 assert.equal(fresh.saved().initialAssessments[0].roadmapPractice.attempts[0].helpUsed,true);
 assert.match(fresh.app.innerHTML,/도움 받고/);
 assert.deepEqual(fresh.saved().initialAssessments[0].diagnostic,initial.initialAssessments[0].diagnostic);
});

test('mentor assignment cancellation confirms started work and keeps answers after reassign and reload',async t=>{
 const h=await boot(t,{saved:seeded()});enterMath(h,'learner');await tick();click(h.app,{choice:'c'});click(h.app,{action:'submit'});
 const original=h.saved().attempts,assignmentId=h.saved().assignments[0].id;
 click(h.node('change-role'));enterMath(h,'mentor');click(h.node('mentor-nav-planning'));
 assert.match(h.app.innerHTML,/指定|지정한 문제/);
 click(h.app,{assignmentAction:'cancel',assignmentId});assert.match(h.app.innerHTML,/학생이 풀던 문제예요/);assert.notEqual(h.saved().assignments[0].status,'canceled');
 click(h.app,{assignmentAction:'cancel',assignmentId,confirmed:'yes'});assert.match(h.app.innerHTML,/풀다가 취소됨/);assert.deepEqual(h.saved().attempts,original);
 click(h.app,{assignmentAction:'reassign',assignmentId});assert.equal(h.saved().paths.length,2);
 const fresh=await boot(t,{local:h.local,tab:h.tab});assert.deepEqual(fresh.saved().attempts,original);
 click(fresh.node('change-role'));enterMath(fresh,'learner');await tick();assert.match(fresh.app.innerHTML,/제출하기/);
});

test('entry large text recommendation turns on the shared large text setting and survives reload', async t => {
  const h = await boot(t, { saved: seeded() });
  const before = h.local.getItem(STORAGE_KEY);
  click(h.app, { ageBand: 'senior' });
  assert.match(h.app.innerHTML, /큰 글씨로 볼까요/);
  assert.equal(h.focused(), 'large-text-accept');
  click(h.app, { displayChoice: 'accept' });
  assert.equal(h.node('html').classes.has('large-text'), true);
  assert.equal(h.node('large-text').attrs['aria-pressed'], 'true');
  assert.equal(h.local.getItem(STORAGE_KEY), before);
  const fresh = await boot(t, { local: h.local, tab: h.tab });
  assert.equal(fresh.node('html').classes.has('large-text'), true);
});

test('logging in with a demo account reaches the workspace, stores no password, and logout returns to login', async t => {
  const h = await boot(t, { saved: seeded() });
  h.node('login-id').value = 'mentor01'; h.node('login-password').value = 'mentor1234';
  click(h.app, { authAction: 'login' });
  assert.match(h.app.innerHTML, /어떤 과목을 함께 배울까요/);
  click(h.app, { subjectId: 'math' });
  assert.equal(h.app.onsubmit, null);
  for (const v of [h.local.getItem(STORAGE_KEY), h.tab.getItem(DEMO_SESSION_KEY)]) assert.doesNotMatch(String(v), /mentor1234/);
  click(h.node('change-role'));
  assert.match(h.app.innerHTML, /id="login-form"/);
});

test('signup submission stores nothing in either storage', async t => {
  const h = await boot(t, { saved: seeded() });
  const before = h.local.getItem(STORAGE_KEY);
  click(h.app, { authAction: 'signup' });
  assert.match(h.app.innerHTML, /id="signup-form"/);
  click(h.app, { signupRole: 'learner' });
  h.node('signup-name').value = '새싹이'; h.node('signup-age').value = 'teen'; h.node('signup-region').value = '강릉시';
  h.node('signup-login-id').value = 'saessak01';
  h.node('signup-password').value = 'abc12345'; h.node('signup-password-confirm').value = 'abc12345';
  h.node('signup-agree').checked = true;
  click(h.app, { authAction: 'signup-submit' });
  assert.match(h.app.innerHTML, /실제 계정은 만들어지지 않았어요/);
  for (const storage of [h.local, h.tab]) {
    for (const key of [STORAGE_KEY, DEMO_SESSION_KEY]) {
      const value = String(storage.getItem(key));
      assert.doesNotMatch(value, /abc12345|새싹이|saessak01/);
    }
  }
  assert.equal(h.local.getItem(STORAGE_KEY), before);
  click(h.app, { authAction: 'login-view' });
  assert.match(h.app.innerHTML, /id="login-form"/);
});
