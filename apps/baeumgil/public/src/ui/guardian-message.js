import { esc } from './text.js';
export function renderGuardianMessage(state,ui) {
 const latest=(state.guardianMessages??[]).filter(m=>m.learnerId===state.learnerId).at(-1);
 return `<section class="card guardian-message-panel"><h3>보호자에게 학습 안내 공유</h3><p class="muted small">이곳에 직접 적어 공유한 문구만 보호자 시연 화면에 보여요. 내부 일지와 AI 제안은 공유되지 않아요.</p><label class="field" for="guardian-message">공유할 안내 (최대 500자)<textarea id="guardian-message" maxlength="500" rows="3">${esc(ui.guardianMessageDraft??latest?.text??'')}</textarea></label><div class="row"><button data-action="share-guardian-message">보호자에게 공유</button><span id="guardian-message-status" role="status"></span></div></section>`;
}
