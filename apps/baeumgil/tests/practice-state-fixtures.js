import {createDemoState,createStore} from '../public/src/state/store.js';
import {validateLinearPractice} from '../public/src/learning/linear-practice.js';
import {catalog,sample} from './practice-fixtures.js';
export function setupAI() {
 const store=createStore({initialState:createDemoState(),catalog});store.startInitialAssessment();
 while(store.getState().initialAssessments[0].status==='active') {
  const a=store.getState().initialAssessments[0];store.presentInitialQuestion({assessmentId:a.id,questionId:a.diagnostic.currentId});store.submitInitialAnswer({assessmentId:a.id,questionId:a.diagnostic.currentId,abstained:true});
 }
 return store;
}
export const at='2026-10-24T13:00:00.000Z';
export function recordFor(state,conceptId='roadmap-linear-sum',id='ai-1') {
 const domain=catalog.diagnostic.learningBundles.find(b=>b.conceptId===conceptId).domain;
 return {id,learnerId:state.learnerId,assessmentId:state.initialAssessments[0].id,cardId:`${domain}:${conceptId}`,baseQuestionId:conceptId,requestId:'req',inputRevision:state.revision,
  ...validateLinearPractice(sample(conceptId)),generatedAt:at,model:'test',status:'ready',presentedAt:null,attempts:[],draftChoiceId:null,evidence:[]};
}
