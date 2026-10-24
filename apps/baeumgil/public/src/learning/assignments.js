// 취소는 응답·근거를 삭제하지 않는다. 현재 학습 대상으로만 제외한다.
export const isCanceledPath=(state,path)=>Boolean(path&&(state.assignments??[]).some(a=>a.id===path.assignmentId&&a.status==='canceled'));
export const learnerPaths=state=>(state.paths??[]).filter(p=>p.learnerId===state.learnerId&&!isCanceledPath(state,p));
