// Both server and browser verify the same bounded integer algebra. Never execute model text.
export const VALIDATOR_VERSION = 1;
export const AI_CONCEPTS = ['roadmap-linear-sum', 'roadmap-like-terms'];
const fail = () => { throw new Error('invalid_linear_spec'); };
const int = (n,lo,hi) => Number.isSafeInteger(n)&&n>=lo&&n<=hi;
const keys = (o,allowed) => o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
function analyze(expression) {
  let nodes=0,variables=0,distributive=false,minus=false;
  function visit(e,depth=0) {
    if(depth>4||++nodes>32||!e)fail();
    let pair,latex;
    if(e.type==='integer'&&keys(e,['type','value'])&&int(e.value,-12,12)) {pair={a:0,b:e.value};latex=String(e.value);}
    else if(e.type==='variable'&&keys(e,['type'])) {pair={a:1,b:0};latex='x';variables++;}
    else if(e.type==='scale'&&keys(e,['type','factor','expression'])&&int(e.factor,-9,9)&&e.factor!==0) {
      const v=visit(e.expression,depth+1);pair={a:e.factor*v.a,b:e.factor*v.b};
      const composite=['add','subtract'].includes(e.expression.type);distributive ||= composite;
      latex=e.expression.type==='variable'?(e.factor===1?'x':e.factor===-1?'-x':`${e.factor}x`):`${e.factor}\\left(${v.latex}\\right)`;
    } else if(['add','subtract'].includes(e.type)&&keys(e,['type','left','right'])) {
      const l=visit(e.left,depth+1),r=visit(e.right,depth+1),s=e.type==='add'?1:-1;
      pair={a:l.a+s*r.a,b:l.b+s*r.b};minus ||= e.type==='subtract'&&['add','subtract'].includes(e.right.type);
      const rhs=s===-1&&(['add','subtract'].includes(e.right.type)||r.latex.startsWith('-'))?`\\left(${r.latex}\\right)`:r.latex;
      latex=`${l.latex}${s===1?(rhs.startsWith('-')?'':'+'):'-'}${rhs}`;
    } else fail();
    if(!Number.isSafeInteger(pair.a)||!Number.isSafeInteger(pair.b))fail();
    return {...pair,latex};
  }
  const result=visit(expression);
  if(!int(result.a,-50,50)||!int(result.b,-50,50))fail();
  return {...result,variables,distributive,minus};
}
export function normalizeLinear(expression) { const {a,b}=analyze(expression);return {a,b}; }
const pairKey = p => `${p.a},${p.b}`;
const simple = ({a,b}) => `${a===0?'':a===1?'x':a===-1?'-x':`${a}x`}${b===0?(a===0?'0':''):b>0?(a===0?String(b):`+${b}`):String(b)}`;
export function validateLinearPractice(spec,{conceptId=spec?.conceptId}={}) {
  try {
    if(!keys(spec,['version','conceptId','expression','options','claimedAnswer','focus'])||spec.version!==1||!AI_CONCEPTS.includes(conceptId)||spec.conceptId!==conceptId)fail();
    const p=analyze(spec.expression);
    if(p.a===0)fail();
    if(conceptId==='roadmap-like-terms'&&(spec.focus!=='like_terms'||p.variables<2||p.distributive||p.minus))fail();
    if(conceptId==='roadmap-linear-sum'&&(!['distributive','minus_parentheses'].includes(spec.focus)||!(spec.focus==='distributive'?p.distributive:p.minus)))fail();
    if(!keys(spec.claimedAnswer,['a','b'])||spec.claimedAnswer.a!==p.a||spec.claimedAnswer.b!==p.b||!Array.isArray(spec.options)||spec.options.length!==4)fail();
    const options=spec.options.map(analyze),answer=pairKey(p),values=options.map(pairKey);
    if(new Set(values).size!==4||values.filter(v=>v===answer).length!==1)fail();
    const canonical = JSON.stringify({conceptId,expression:canonicalAST(spec.expression),options:[...values].sort()});
    const fingerprint=`linear-v1:${canonical}`;
    let hash=2166136261;for(const c of fingerprint)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
    const question={id:`ai-linear-${hash.toString(16)}`,kind:'ai_generated',conceptIds:[conceptId],
      prompt:`다음 식을 간단히 하세요. $${p.latex}$`,choices:options.map((v,i)=>({id:`option-${i+1}`,value:values[i],text:`$${simple(v)}$`})),answer,
      solutionSteps:[`주어진 식: $${p.latex}$`,p.distributive||p.minus?'괄호 앞의 계수와 빼기 부호를 각 항에 적용해요.':'문자항과 상수항을 각각 모아요.',`문자항의 계수는 $${p.a}$, 상수항은 $${p.b}$이므로 정답은 $${simple(p)}$입니다.`]};
    return {ok:true,question,fingerprint,spec:structuredClone(spec),validatorVersion:VALIDATOR_VERSION};
  } catch {return {ok:false,code:'invalid_linear_spec'};}
}
function canonicalAST(e) {
  if(e.type==='integer')return ['n',e.value];if(e.type==='variable')return ['x'];
  if(e.type==='scale')return ['scale',e.factor,canonicalAST(e.expression)];
  const parts=[canonicalAST(e.left),canonicalAST(e.right)];
  if(e.type==='add')parts.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return [e.type,...parts];
}
