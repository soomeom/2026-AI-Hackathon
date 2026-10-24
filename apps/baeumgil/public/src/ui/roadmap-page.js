import { celebrateRelationCompletion } from './completion-effects.js';
import { initialAssessmentSummary } from '../learning/initial-assessment.js';
import { buildConceptMap } from '../learning/concept-map.js';
import { roadmapCards } from '../learning/roadmap.js';
import { renderConceptMap, growthCount, focusNodeOf } from './concept-map.js';
import { renderRoadmap } from './roadmap.js';
import { renderRelationMap, animateRelationMap } from './relation-map.js';
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
  if (!practicing && ui.pendingStampIds?.length) {
    const completed=map.nodes.find(n=>n.courseComplete && ui.pendingStampIds.includes(n.id));
    if(completed){ui.mapNodeId=completed.id;ui.mapView='relation';ui.relationZoom=true;}
  }
  // 멘토는 전체 조망(관계 지도), 학생은 내 배움길이 기본
  const view = ['map','relation'].includes(ui.mapView) ? ui.mapView : mentor ? 'relation' : 'map';
  // 학생: 진단 전·진행 중이면 오른쪽 패널 위에 첫 수준 확인 안내를 띄운다
  const assessmentCta = !mentor && !canPractice ? `<div class="map-cta" role="status"><p><b>${summary?'진단 진행 중이에요.':'첫 수준 확인 전이에요.'}</b> ${summary?'지금까지의 응답만 표시해요. 마저 풀면 나에게 맞는 시작점과 보충 문제가 연결돼요.':'검정고시 문제로 나에게 맞는 시작점을 찾아요.'}</p><button class="ghost small" data-map-action="assessment">첫 수준 확인으로 이동 →</button></div>` : '';
  root.innerHTML = `${mentor ? mentorTabs('roadmap',state.learners?.find(l=>l.id===state.learnerId)) : ''}
    <section class="card roadmap-page">
      <div class="map-page-heading"><div><p class="meta">${mentor?'학생의 배움길을 함께 살펴봐요':'나의 다음 배움길'}</p><h2>학습 로드맵</h2><p class="muted">무엇부터 공부할지, 개념의 연결에서 찾아요.</p></div>
      ${!practicing?`<div class="map-controls" aria-label="로드맵 보기 방식"><button data-map-action="view" data-map-value="map" aria-pressed="${view==='map'}">내 배움길</button><button data-map-action="view" data-map-value="relation" aria-pressed="${view==='relation'}">관계 지도</button></div>`:''}</div>
      ${!canPractice&&mentor?`<div class="msg">${summary?'진단 진행 중 · 지금까지의 응답만 표시해요.':'아직 첫 수준 확인 전이에요. 개념의 연결부터 살펴볼 수 있어요.'} 멘티가 진단을 마치거나 중간 결과를 넘기면 보충 학습을 함께 볼 수 있어요.</div>`:''}
      <div class="map-summary"><div><span>현재 추정 수준 티어</span><strong>${esc(summary?.report?.tier??'진단 후 확인')}</strong></div><div><span>다음 학습</span><strong>${esc(next?.title??(canPractice?'기록된 보완 과제 없음':'진단으로 시작점 찾기'))}</strong></div><div><span>도움 없이 확인한 개념</span><strong>${growthCount(map)}개 <small class="muted">/ ${map.nodes.length} · 고졸 ${map.nodes.filter(n=>n.status==='mastered').length}개</small></strong></div></div>

      <p class="muted small">각 단계는 학년이 아닌 선수 관계를 뜻해요. 연습 완료는 최초 진단 판정을 바꾸지 않아요.</p>
      ${summary?.roadmap?.legacy?'<p class="msg">이전 진단 기록은 보존하고, 연결선은 현재 개념 자료를 기준으로 보여요.</p>':''}
      ${practicing ? renderRoadmap(summary.roadmap,summary.practice,catalog.questions,ui) : view==='relation' ? renderRelationMap(map,ui,{cards,canPractice,entries:summary?.entries??[],practice:summary?.practice,questions:catalog.questions,cta:assessmentCta}) : renderConceptMap(map,ui,{cards,canPractice,entries:summary?.entries??[],practice:summary?.practice,questions:catalog.questions,mentor,cta:assessmentCta})}
    </section>`;
  if (!practicing && view === 'relation') { animateRelationMap(root, ui); celebrateRelationCompletion(root, ui); }
  root.onkeydown = event => {
    // 지도 노드(SVG)는 Enter·Space로도 고른다
    const node = event.target?.closest?.('g[data-map-action]');
    if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault?.(); root.onclick({ target: node }); return; }
    if (event.key !== 'Escape') return;
    if (ui.mapOverviewOpen) { ui.mapOverviewOpen = false; rerender(); root.querySelector?.('#map-course')?.focus?.(); }
    else if (ui.relationZoom) { ui.relationZoom = false; rerender(); }
  };
  root.onclick = event => {
    const button = event.target.closest('button,[data-map-action]');
    if (!button || button.disabled) return;
    if (button.dataset.tab) { ui.mentorTab = button.dataset.tab; rerender(); return; }
    if (handleInitialAssessmentAction(button,props)) return;
    const action = button.dataset.mapAction, value = button.dataset.mapValue;
    if (action === 'view' && ['map','relation'].includes(value)) ui.mapView = value;
    else if (action === 'zoom') ui.relationZoom = value === 'on';
    else if (action === 'overview' || action === 'overview-close') ui.mapOverviewOpen = action === 'overview';
    else if (action === 'domain' && map.nodes.some(n=>n.domain===value)) {
      ui.mapDomainId = value; ui.mapNodeId = focusNodeOf(map,value)?.id; ui.mapOverviewOpen = false;
    } else if (action === 'select' && map.nodes.some(n=>n.id===button.dataset.mapNode)) {
      ui.mapNodeId = button.dataset.mapNode;
      ui.mapDomainId = map.nodes.find(n=>n.id===ui.mapNodeId).domain; ui.mapOverviewOpen = false;
    } else if (action === 'assessment' && !mentor) {
      ui.learnerTab = 'learning'; ui.initialAssessmentOpen = true; props.syncVisibility?.();
    } else return;
    rerender();
    // 관계 지도에서는 고른 노드에 포커스를 두고 화면을 옮기지 않는다 (지도를 계속 보며 고르게)
    const onRelation = ui.mapView === 'relation' || (mentor && !['map','relation'].includes(ui.mapView));
    if (onRelation && (action==='select'||action==='zoom')) {
      const sel = action==='select' ? root.querySelector?.(`g[data-map-node="${button.dataset.mapNode}"]`) : null;
      (sel ?? root.querySelector?.('#map-heading'))?.focus?.({preventScroll:true});
      return;
    }
    const target = action==='overview' ? '#map-overview-title' : action==='overview-close' ? '#map-course' : action==='select'||action==='domain' ? '#map-detail-title' : '#map-heading';
    const heading = action==='assessment' ? root : root.querySelector?.(target) ?? root;
    heading?.focus?.({preventScroll:true});
    if(action==='select'||action==='domain') heading?.scrollIntoView?.({block:'nearest',behavior:'instant'});
  };
}
