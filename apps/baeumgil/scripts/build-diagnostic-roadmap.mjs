// Reproducible, reviewed prerequisite graph. Never change official prompts or answer keys.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../public/src/content/', import.meta.url);
const read = n => JSON.parse(readFileSync(new URL(n + '.json', root), 'utf8'));
const write = (n, v) => writeFileSync(new URL(n + '.json', root), JSON.stringify(v, null, 2) + '\n');
const content = read('questions'), concepts = read('concepts'), reviews = read('review');
const config = read('diagnostic');
const names = Object.fromEntries(config.domains.map(d => [d.id, d.name]));
// slug, domain, stage level (not a formal grade), concept, prompt, options, answer index, explanation
const rows = [
  ['linear-sum','algebra',2,'일차식의 계산','$2(x+3)-(x-1)$을 간단히 하면?', ['x+7','x+5','3x+7','x-7'],1,'괄호 앞의 부호를 각 항에 곱한 뒤 동류항을 모아요. $2x+6-x+1=x+7$입니다.'],
  ['like-terms','algebra',1,'동류항 정리','$3x+2x-4$를 간단히 하면?', ['5x-4','x-4','5x+4','x'],1,'문자와 차수가 같은 항끼리 계수를 더해요. $3x+2x=(3+2)x=5x$이고 상수항 $-4$는 따로 둡니다.'],
  ['product','algebra',1,'분배법칙과 다항식의 곱셈','$x(x+2)$를 전개하면?', ['x^2+2','x^2+2x','2x^2','3x'],2,'분배법칙으로 $x$를 각 항에 곱해요. $x\\times x=x^2$이므로 $x^2+2x$입니다. 지수법칙은 이런 곱셈·거듭제곱에서 사용해요.'],
  ['real-roots','equations',2,'제곱과 실근의 존재','$x^2=-4$의 실수 해는 몇 개인가요?', ['0','1','2','4'],1,'실수를 제곱한 값은 $0$ 이상이라 $-4$가 될 수 없어요. 이차방정식을 완전제곱으로 바꾸면 판별식의 부호와 실근의 개수를 연결할 수 있어요.'],
  ['signed-square','equations',1,'음수의 제곱과 부호','$(-3)^2$의 값은?', ['-9','-6','6','9'],4,'괄호 안 전체를 두 번 곱해요. $(-3)\\times(-3)=9$입니다. 음수의 제곱도 양수예요.'],
  ['root-product','equations',2,'이차방정식의 근과 인수','$ (x-2)(x-3)=0$의 두 근의 곱은?', ['1','5','6','-6'],3,'곱이 $0$이려면 한 인수가 $0$이에요. 근은 $2,3$이고 곱은 $6$입니다. 전개한 식의 상수항과 비교해 보세요.'],
  ['conjugates','equations',1,'합차의 곱과 분배법칙','$(a+b)(a-b)$를 전개하면?', ['a^2+b^2','a^2-b^2','a^2-2ab+b^2','2a-2b'],2,'분배법칙으로 전개하면 $a^2-ab+ab-b^2=a^2-b^2$입니다. 제곱근을 포함한 두 근의 곱도 이 방식으로 계산해요.'],
  ['function-value','functions',2,'일차함수의 기본 개념과 함숫값','$f(x)=2x-3$일 때 $f(4)$의 값은?', ['1','4','5','8'],3,'일차함수 $f(x)=ax+b$는 입력 $x$에 출력 $ax+b$를 대응시켜요. $f(4)=2\\times4-3=5$. 합성함수에서는 안쪽 함수의 출력이 바깥 함수의 입력이 됩니다.'],
  ['substitution','functions',1,'문자식에 수 대입하기','$x=-2$일 때 $3x+1$의 값은?', ['-7','-5','5','7'],2,'문자 자리에 수를 괄호와 함께 넣어요. $3\\times(-2)+1=-6+1=-5$입니다.'],
  ['square-min','functions',1,'제곱의 비음수성','$x$가 실수일 때 $x^2$의 가장 작은 값은?', ['-1','0','1','2'],2,'실수의 제곱은 음수가 될 수 없고 $x=0$에서 $0$이에요. $y=(x-a)^2+b$는 $x=a$에서 최솟값 $b$를 갖습니다.'],
  ['coordinate-ratio','geometry',2,'좌표에서 내분과 비율','수직선의 $A(0),B(6)$ 사이를 $1:2$로 내분하는 점의 좌표는?', ['1','2','3','4'],2,'전체를 $1+2=3$부분으로 나누면 한 부분은 $6/3=2$예요. $A$에서 한 부분만큼 이동해 좌표는 $2$. 평면에서는 각 좌표에 따로 적용해요.'],
  ['ratio-parts','geometry',1,'비에 따른 전체 나누기','길이 $12$를 $1:2$로 나눌 때 작은 부분의 길이는?', ['2','3','4','6'],3,'전체 비의 합은 $3$이에요. 한 부분은 $12/3=4$이고 큰 부분은 $8$입니다.'],
  ['pythagoras','geometry',2,'피타고라스 정리와 좌표 거리','직각삼각형의 두 직각변 길이가 $3,4$일 때 빗변의 길이는?', ['5','7','12','25'],1,'빗변 길이 $c$는 $c^2=3^2+4^2=25$, 따라서 $c=5$예요. 거리 공식의 $\\sqrt{a^2+b^2}$도 이 직각삼각형 관계에서 나옵니다.'],
  ['square-sum','geometry',1,'제곱의 합 계산','$3^2+4^2$의 값은?', ['7','14','25','49'],3,'각 수를 먼저 제곱한 뒤 더해요. $3^2+4^2=9+16=25$이며 $(3+4)^2$와 달라요.'],
  ['line-basic','geometry',2,'직선의 방정식 기본형','$y=2x+1$을 $ax+by+c=0$ 꼴로 바르게 옮긴 것은?', ['2x-y+1=0','2x+y+1=0','x-2y+1=0','2x-y-1=0'],1,'모든 항을 한쪽으로 옮겨요. $2x-y+1=0$에서 $a=2,b=-1,c=1$. 점과 직선의 거리에는 이 계수와 점의 좌표를 넣어요.'],
  ['point-value','geometry',1,'좌표 대입과 등식','$x=1,y=3$일 때 $2x-y+1$의 값은?', ['-1','0','1','2'],2,'좌표를 각각 대입하면 $2\\times1-3+1=0$이에요. 값이 $0$이므로 점 $(1,3)$은 직선 $2x-y+1=0$ 위에 있어요.'],
  ['truth-inclusion','logic',2,'진리집합의 포함 관계','조건 $p,q$의 진리집합을 각각 $P,Q$라 할 때, $P=\\{2\\}$, $Q=\\{1,2,3\\}$일 때 항상 참인 함의는?', ['$p\\Rightarrow q$만 참','$q\\Rightarrow p$만 참','둘 다 참','둘 다 거짓'],1,'$P\\subset Q$이므로 $p$이면 $q$예요. $q$는 $p$의 필요조건, $p$는 $q$의 충분조건이에요. 포함 방향을 먼저 확인하세요.'],
  ['truth','logic',1,'명제의 참·거짓과 조건 대입','실수 $x$에 대한 조건 $x-3=0$에 $x=3$을 넣으면?', ['참','거짓','항상 판단 불가','모든 실수에서 참'],1,'$3-3=0$이므로 이 값에서는 참이에요. 조건이 참이 되는 값들의 집합이 진리집합입니다.'],
  ['set-operations','logic',2,'합집합과 교집합','$A=\\{1,2\\},B=\\{2,3\\}$일 때 $n(A\\cup B)+n(A\\cap B)$는?', ['2','3','4','5'],3,'합집합은 $\\{1,2,3\\}$으로 $3$개, 교집합은 $\\{2\\}$로 $1$개입니다. 공통 원소를 구분해 $3+1=4$를 계산해요.'],
  ['pairs','counting',2,'중복 없는 쌍 나열','$1,2,3$에서 서로 다른 두 수를 동시에 고르는 경우는 몇 가지인가요?', ['2','3','6','9'],2,'$(1,2),(1,3),(2,3)$의 $3$가지예요. 동시에 고르면 $(1,2)$와 $(2,1)$은 같으므로 중복을 빼야 해요.'],
  ['enumerate','counting',1,'조건에 맞는 대상 나열','$1,2,3,4$ 중 $2$의 배수는 모두 몇 개인가요?', ['1','2','3','4'],2,'조건을 만족하는 $2,4$를 빠짐없이 한 번씩 적어 세면 $2$개예요. 여러 장을 고를 때도 조건을 확인하며 나열해요.'],
  ['choose-complement','counting',2,'선택과 제외의 대응','서로 다른 카드 $4$장 중 $3$장을 고르는 경우의 수는?', ['1','3','4','12'],3,'고를 $3$장 대신 제외할 $1$장을 정하면 돼요. 제외할 카드가 $4$가지이므로 고르는 방법도 $4$가지입니다.'],
  ['set-elements','logic',1,'공통 원소 찾기','$A=\\{1,2,3\\},B=\\{2,4\\}$에 공통으로 들어 있는 원소는?', ['1','2','3','4'],2,'두 집합에 모두 들어 있는 것은 $2$예요. 공통 원소를 모으면 교집합이 됩니다.'],
];
// A second worked exercise per concept gives genuine practice beyond recalling a diagnostic answer.
const variants = [
 ['linear-sum','$3(x+1)-(x-2)$를 간단히 하면?', ['2x+5','2x+1','4x+5','2x-5'],1,'괄호를 풀면 $3x+3-x+2=2x+5$입니다.'],
 ['like-terms','$4y-y+2$를 간단히 하면?', ['5y+2','3y+2','3y-2','5y'],2,'동류항의 계수를 계산하면 $(4-1)y+2=3y+2$입니다.'],
 ['product','$2x(x+3)$을 전개하면?', ['2x^2+3','2x^2+6','2x^2+6x','2x+6x'],3,'각 항에 $2x$를 곱하면 $2x^2+6x$입니다.'],
 ['real-roots','$x^2=9$의 서로 다른 실수 해는 몇 개인가요?', ['0','1','2','9'],3,'$x=3$과 $x=-3$의 제곱이 모두 $9$이므로 두 개입니다.'],
 ['signed-square','$(-4)^2$의 값은?', ['-16','-8','8','16'],4,'음수 두 개를 곱하면 양수이므로 $(-4)(-4)=16$입니다.'],
 ['root-product','$(x+1)(x-4)=0$의 두 근의 곱은?', ['-4','-3','3','4'],1,'근은 $-1,4$이므로 곱은 $-4$입니다.'],
 ['conjugates','$(x+3)(x-3)$을 전개하면?', ['x^2+9','x^2-9','x^2-6x+9','x^2-3'],2,'전개하면 $x^2-3x+3x-9=x^2-9$입니다.'],
 ['function-value','$f(x)=3x+2$일 때 $f(-1)$은?', ['-5','-1','1','5'],2,'입력에 $-1$을 넣으면 $3(-1)+2=-1$입니다.'],
 ['substitution','$a=3$일 때 $2a-5$는?', ['-1','0','1','6'],3,'$2(3)-5=6-5=1$입니다.'],
 ['square-min','$(x-2)^2$가 $0$이 되는 $x$는?', ['-2','0','1','2'],4,'괄호 안이 $0$이어야 하므로 $x-2=0$, 즉 $x=2$입니다.'],
 ['coordinate-ratio','수직선의 $A(2),B(8)$ 사이를 $1:2$로 내분하는 점의 좌표는?', ['2','3','4','6'],3,'길이 $6$을 세 부분으로 나눈 한 부분은 $2$. $A$의 좌표 $2$에서 $2$만큼 이동하면 $4$입니다.'],
 ['ratio-parts','길이 $15$를 $2:3$으로 나눌 때 작은 부분의 길이는?', ['3','5','6','9'],3,'한 부분은 $15/(2+3)=3$. 작은 부분은 두 부분이므로 $6$입니다.'],
 ['pythagoras','직각삼각형의 두 직각변 길이가 $6,8$일 때 빗변의 길이는?', ['10','12','14','100'],1,'빗변의 제곱은 $6^2+8^2=100$이므로 빗변은 $10$입니다.'],
 ['square-sum','$6^2+8^2$의 값은?', ['14','28','100','196'],3,'$36+64=100$입니다. 각 수를 제곱한 뒤 더해야 해요.'],
 ['line-basic','$y=-x+2$를 $ax+by+c=0$ 꼴로 옮긴 것은?', ['x+y-2=0','x-y+2=0','x+y+2=0','x-y-2=0'],1,'$x$와 상수항을 옮기면 $x+y-2=0$입니다.'],
 ['point-value','$x=2,y=1$일 때 $x+y-3$의 값은?', ['-1','0','1','3'],2,'$2+1-3=0$이므로 이 점은 직선 $x+y-3=0$ 위에 있어요.'],
 ['truth-inclusion','조건 $p,q$의 진리집합을 각각 $P,Q$라 할 때, $P=\\{1,2\\},Q=\\{1,2,3\\}$일 때 $p$와 $q$의 관계는?', ['$p$는 $q$의 충분조건','$p$는 $q$의 필요조건만 됨','필요충분조건','아무 관계 없음'],1,'$P$의 모든 원소가 $Q$에 있으므로 $p$이면 $q$. 따라서 $p$는 $q$의 충분조건입니다.'],
 ['truth','$x=2$일 때 조건 $x+1=4$는?', ['참','거짓','모든 실수에서 참','항상 판단 불가'],2,'$2+1=3$은 $4$와 같지 않으므로 거짓입니다.'],
 ['set-operations','$A=\\{1,3\\},B=\\{3,5\\}$일 때 교집합의 원소 개수는?', ['0','1','2','3'],2,'공통 원소는 $3$ 하나이므로 원소 개수는 $1$입니다.'],
 ['pairs','$1,2,3,4$에서 서로 다른 두 수를 동시에 고르는 경우의 수는?', ['4','6','8','12'],2,'$(1,2),(1,3),(1,4),(2,3),(2,4),(3,4)$의 여섯 쌍입니다.'],
 ['enumerate','$1,2,3,4,5,6$ 중 $3$의 배수는 몇 개인가요?', ['1','2','3','6'],2,'$3,6$ 두 개가 조건을 만족합니다.'],
 ['choose-complement','서로 다른 카드 $6$장 중 $5$장을 고르는 경우의 수는?', ['1','5','6','30'],3,'제외할 한 장을 고르는 여섯 가지 경우와 일대일로 대응해요.'],
 ['set-elements','$A=\\{2,4,6\\},B=\\{1,4,5\\}$의 공통 원소는?', ['1','2','4','6'],3,'두 집합에 모두 들어 있는 원소는 $4$ 하나예요.'],
];
// Authored questions are intentionally small; their worked solutions are the teaching content.
const authored = rows.map(([slug,domain,level,title,prompt,options,answer,explanation]) => ({
  id: `roadmap-${slug}`, kind:'authored', role:'diagnostic', contentStatus:'approved', approvalScope:'local_diagnostic_content',
  prompt, answerFormat:'choice', choices:options.map((text,i)=>({id:'abcd'[i],value:String(i+1),text, ...(!/[가-힣$]/.test(text)?{latex:text}:{})})), answer:String(answer),
  solutionSteps:[explanation], conceptIds:[`roadmap-${slug}`], domain, level,
  difficulty: level === 1 ? '기초' : '연결 개념', curriculum:{major:names[domain],unit:title,core:title},
  prerequisite_concept:[], fallback_question_id:null, prerequisite_question_ids:[], reference:{authored:true},
  review:{method:'independent_calculation_and_prerequisite_review',reviewer:'Codex',date:'2026-10-24',educatorValidated:false},
}));
for(const [slug,prompt,options,answer,explanation] of variants){
  const original=authored.find(q=>q.id===`roadmap-${slug}`);
  authored.push({...structuredClone(original),id:`roadmap-${slug}-practice`,prompt,
    choices:options.map((text,i)=>({id:'abcd'[i],value:String(i+1),text,...(!/[가-힣$]/.test(text)?{latex:text}:{})})),answer:String(answer),solutionSteps:[explanation]});
}
content.questions = content.questions.filter(q=>!q.id.startsWith('roadmap-')).concat(authored);
const byId = new Map(content.questions.map(q=>[q.id,q]));
const high = n => `ged-high-2025-1-math-q${String(n).padStart(2,'0')}`;
const links = [
  [high(1),'roadmap-linear-sum'], ['roadmap-linear-sum','roadmap-like-terms'],
  [high(3),'astra-expand'], ['astra-expand','roadmap-product'], ['astra-expand-check','roadmap-product'],
  [high(5),'roadmap-real-roots'], ['roadmap-real-roots','roadmap-signed-square'],
  [high(6),'roadmap-root-product'], ['roadmap-root-product','roadmap-conjugates'],
  [high(7),'ged-middle-2025-1-math-q17'], ['ged-middle-2025-1-math-q17','roadmap-square-min'], ['astra-quadratic-vertex','roadmap-square-min'],
  [high(16),'roadmap-function-value'], ['roadmap-function-value','roadmap-substitution'],
  [high(10),'roadmap-coordinate-ratio'], ['roadmap-coordinate-ratio','roadmap-ratio-parts'],
  [high(11),'roadmap-pythagoras','roadmap-line-basic'], ['roadmap-pythagoras','roadmap-square-sum'], ['roadmap-line-basic','roadmap-point-value'],
  [high(14),'roadmap-set-operations'], ['roadmap-set-operations','roadmap-set-elements'],
  [high(15),'roadmap-truth-inclusion'], ['roadmap-truth-inclusion','roadmap-truth'],
  [high(19),'roadmap-pairs'], ['roadmap-pairs','roadmap-enumerate'],
  [high(20),'roadmap-choose-complement'], ['roadmap-choose-complement','roadmap-enumerate'],
  ['ged-middle-2025-1-math-q15','roadmap-signed-square'], ['ged-middle-2025-1-math-q16','ged-middle-2025-1-math-q04'],
  ['ged-middle-2025-1-math-q19','ged-middle-2025-1-math-q12'],
];
for (const q of content.questions.filter(q=>q.role==='diagnostic')) {
  // Clear old domain-wide shortcuts, including legacy questions retained for saved histories.
  q.prerequisite_question_ids=[]; q.fallback_question_id=null; q.prerequisite_concept=[];
  q.remedialPath={questionIds:[],reason:'기초 개념 직접 확인'};
}
for (const [id,...lower] of links) {
  const q=byId.get(id); q.prerequisite_question_ids=lower; q.fallback_question_id=lower[0];
  q.prerequisite_concept=[...new Set(lower.flatMap(id=>byId.get(id).conceptIds))];
  q.remedialPath={questionIds:lower,reason:'상위 풀이에 직접 사용하는 선수 개념 확인 (오답 원인 확정 아님)'};
}
for(const q of authored.filter(q=>q.id.endsWith('-practice'))){
  const original=byId.get(q.id.replace(/-practice$/,''));
  q.prerequisite_question_ids=[...original.prerequisite_question_ids];q.fallback_question_id=original.fallback_question_id;
  q.prerequisite_concept=[...original.prerequisite_concept];q.remedialPath=structuredClone(original.remedialPath);
}
for (const q of content.questions.filter(q=>q.role==='diagnostic')) {
  for(const id of q.conceptIds) {
    let c=concepts.concepts.find(c=>c.id===id);
    if(!c){c={id}; concepts.concepts.push(c);}
    Object.assign(c,{name:q.curriculum.core,summary:q.solutionSteps.join(' '),prerequisiteIds:q.prerequisite_concept});
  }
}
reviews.reviews=reviews.reviews.filter(r=>!r.questionId.startsWith('roadmap-'));
for(const q of authored) reviews.reviews.push({questionId:q.id,reviewers:['Codex'],reviewedOn:'2026-10-24',scope:'local_diagnostic_content',checks:{answerVerified:true,singleCorrectAnswer:true,authoredNotCopied:true},educatorValidated:false});
config.version=2; config.maxQuestions=40;
for(const d of config.domains) {
  const ids=new Set(); const visit=id=>{if(ids.has(id))return;ids.add(id);byId.get(id).prerequisite_question_ids.forEach(visit);};
  d.levels[3].forEach(visit);
  d.levels=Object.fromEntries([1,2,3].map(l=>[l,[...ids].filter(id=>byId.get(id).level===l)]));
}
// Bundles retain legacy concepts too, so old sessions remain reviewable and exercisable.
config.learningBundles=[];
for(const q of content.questions.filter(q=>q.role==='diagnostic')) {
  const conceptId=q.conceptIds[0]; let b=config.learningBundles.find(b=>b.conceptId===conceptId);
  if(!b){b={id:conceptId,conceptId,domain:q.domain,level:q.level,title:q.curriculum.core,explanation:q.solutionSteps.join(' '),questionIds:[]};config.learningBundles.push(b);}
  b.questionIds.push(q.id);
}
config.stageMeaning='단계는 선수 관계의 깊이이며 정규 학년 분류가 아닙니다. 집합·명제 기초는 고1 개념을 단순화한 확인입니다.';
write('questions',content); write('concepts',concepts); write('review',reviews); write('diagnostic',config);
console.log(`Corrected ${links.length} links; ${authored.length} authored exercises; ${config.learningBundles.length} learning bundles.`);
