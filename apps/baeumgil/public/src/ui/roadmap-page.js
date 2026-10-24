import { initialAssessmentSummary } from '../learning/initial-assessment.js';
import { buildConceptMap } from '../learning/concept-map.js';
import { roadmapCards } from '../learning/roadmap.js';
import { renderConceptMap } from './concept-map.js';
import { renderRoadmap } from './roadmap.js';
import { handleInitialAssessmentAction } from './initial-assessment.js';
import { esc, mentorTabs } from './text.js';

export function renderRoadmapPage(props) {
  const { root, state, catalog, ui, rerender } = props;
  const mentor = ui.role === 'mentor';
  const summary = initialAssessmentSummary(state, state.learnerId, { catalog });
  const map = buildConceptMap(summary?.roadmap, catalog.questions, catalog.diagnostic);
  const canPractice = summary?.status === 'completed';
  const cards = summary?.roadmap ? roadmapCards(summary.roadmap) : [];
  const next = map.nodes.find(n => n.id === map.nextNodeId);
  const practicing = canPractice && cards.some(c => c.id === summary.practice.cardId);
  const view = ui.mapView === 'cards' && canPractice ? 'cards' : 'map';
  root.innerHTML = `${mentor ? mentorTabs('roadmap',state.learners?.find(l=>l.id===state.learnerId)) : ''}
    <section class="card roadmap-page">
      <div class="map-page-heading"><div><p class="meta">${mentor?'학생의 배움길을 함께 살펴봐요':'나의 다음 배움길'}</p><h2>학습 로드맵</h2><p class="muted">무엇부터 공부할지, 개념의 연결에서 찾아요.</p></div>
      ${!practicing?`<div class="map-controls" aria-label="로드맵 보기 방식"><button data-map-action="view" data-map-value="map" aria-pressed="${view==='map'}">개념 지도</button><button data-map-action="view" data-map-value="cards" aria-pressed="${view==='cards'}" ${!canPractice?'disabled':''}>단계별 카드</button></div>`:''}</div>
      ${!canPractice?`<div class="msg">${summary?'진단 진행 중 · 지금까지의 응답만 표시해요.':'아직 첫 수준 확인 전이에요. 개념의 연결부터 살펴볼 수 있어요.'} ${!mentor?'<button class="ghost small" data-map-action="assessment">첫 수준 확인으로 이동 →</button>':'멘티가 진단을 마치거나 중간 결과를 넘기면 보충 학습을 함께 볼 수 있어요.'}</div>`:''}
      <div class="map-summary"><div><span>현재 추정 수준 티어</span><strong>${esc(summary?.report?.tier??'진단 후 확인')}</strong></div><div><span>다음 학습</span><strong>${esc(next?.title??(canPractice?'기록된 보완 과제 없음':'진단으로 시작점 찾기'))}</strong></div><div><span>고졸 본 문항 진단 통과</span><strong>${map.nodes.filter(n=>n.status==='mastered').length}개</strong></div></div>
      <p class="muted small">선은 현재 검수된 직접 선수 관계예요. 각 단계는 학년이 아닌 선수 관계를 뜻해요. 연습 완료는 최초 진단 판정을 바꾸지 않아요.</p>
      ${summary?.roadmap?.legacy?'<p class="msg">이전 진단 기록은 보존하고, 연결선은 현재 개념 자료를 기준으로 보여요.</p>':''}
      ${practicing || view==='cards' ? renderRoadmap(summary.roadmap,summary.practice,catalog.questions,ui) : renderConceptMap(map,ui,{cards,canPractice,entries:summary?.entries??[]})}
    </section>`;
  root.onclick = event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.tab) { ui.mentorTab = button.dataset.tab; rerender(); return; }
    if (handleInitialAssessmentAction(button,props)) return;
    const action = button.dataset.mapAction, value = button.dataset.mapValue;
    if (action === 'view' && ['map','cards'].includes(value)) ui.mapView = value;
    else if (action === 'scope' && ['path','domain','all'].includes(value)) {
      ui.mapScope = value;
      if (value==='path') ui.mapNodeId = map.nextNodeId ?? map.nodes[0]?.id;
      if (value==='domain') ui.mapDomainId = map.nodes.find(n=>n.id===ui.mapNodeId)?.domain ?? next?.domain ?? map.nodes[0]?.domain;
    } else if (action === 'domain' && map.nodes.some(n=>n.domain===value)) {
      ui.mapDomainId = value; ui.mapNodeId = map.nodes.find(n=>n.domain===value)?.id;
    } else if (action === 'select' && map.nodes.some(n=>n.id===button.dataset.mapNode)) {
      ui.mapNodeId = button.dataset.mapNode;
      if (ui.mapScope==='domain') ui.mapDomainId = map.nodes.find(n=>n.id===ui.mapNodeId).domain;
    } else if (action === 'assessment' && !mentor) {
      ui.learnerTab = 'learning'; ui.initialAssessmentOpen = true; props.syncVisibility?.();
    } else return;
    rerender();
    const target = action==='select' ? '#map-detail-title' : action==='view' && value==='cards' && canPractice ? '#roadmap-title' : '#map-heading';
    const heading = action==='assessment' ? root : root.querySelector?.(target) ?? root;
    heading?.focus?.({preventScroll:true});
    if(action==='select') heading?.scrollIntoView?.({block:'nearest',behavior:'instant'});
  };
}
