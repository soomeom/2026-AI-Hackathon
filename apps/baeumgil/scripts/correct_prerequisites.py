"""Apply reviewed direct-prerequisite chains; safe to rerun after base import."""
from pathlib import Path
import json
P=Path(__file__).resolve().parents[1]/'public/src/content'
def load(n):return json.loads((P/n).read_text())
def save(n,v):(P/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
b=load('questions.json');cfg=load('diagnostic.json');concepts=load('concepts.json');reviews=load('review.json')
# slug, domain, level, concept, two (prompt, choices, correct index, explanation) variants
# Korean curricular wording and arithmetic-checked alternatives.
specs=[
('like','algebra',2,'동류항 정리와 일차식 계산',[(r'$3x+2+4x-5$를 정리한 것은?',['7x-3','7x+7','12x-3','3x-3'],1,r'$3x+4x=7x$, $2-5=-3$이므로 $7x-3$.'),(r'$5x-3-(2x+4)$를 정리한 것은?',['3x+1','7x-7','3x-7','3x+7'],3,r'괄호 앞의 음수를 분배하면 $5x-3-2x-4=3x-7$.')]),
('signed','algebra',1,'부호와 계수의 덧셈',[(r'$3+(-5)$의 값은?',['-2','2','8','-8'],1,r'$3-5=-2$.'),(r'$-2+7$의 값은?',['-9','9','-5','5'],4,r'$7-2=5$.')]),
('truthset','logic',2,'명제의 진리집합 포함 관계',[(r'$P=\{2,4\}$, $Q=\{1,2,3,4\}$이다. $p$가 참인 모든 경우에 $q$도 참이 되기 위한 관계는?', [r'P\subseteq Q',r'Q\subseteq P',r'P\cap Q=\varnothing',r'P=\varnothing'],1,r'$p\Rightarrow q$는 $P$의 모든 원소가 $Q$에 포함된다는 뜻이다.'),(r'진리집합이 $P=\{1\}$, $Q=\{1,2\}$일 때 옳은 설명은?', ['p는 q의 필요조건이다.','p는 q의 충분조건이다.','p와 q는 동치이다.','p이면 q가 아니다.'],2,r'$P\subseteq Q$이므로 $p\Rightarrow q$. 따라서 $p$는 $q$의 충분조건이다.')]),
('truth','logic',1,'명제의 참과 거짓',[(r'$x=2$일 때 명제 $x>1$은?', ['참','거짓','판단할 수 없음','명제가 아님'],1,r'$2>1$이므로 참이다.'),(r'$x=3$일 때 명제 $x<0$은?', ['참','거짓','판단할 수 없음','명제가 아님'],2,r'$3<0$은 성립하지 않으므로 거짓이다.')]),
('intersection','logic',2,'합집합과 교집합의 원소',[(r'$A=\{1,2\}$, $B=\{2,3\}$일 때 $n(A\cup B)$는?', ['1','2','3','4'],3,r'$A\cup B=\{1,2,3\}$이므로 3개.'),(r'$A=\{1,2,3\}$, $B=\{2,3,4\}$일 때 $n(A\cap B)$는?', ['1','2','3','4'],2,r'공통 원소는 $2,3$ 두 개이다.')]),
('member','logic',1,'집합의 원소 판별',[(r'$A=\{1,3,5\}$의 원소인 수는?', ['2','3','4','6'],2,r'$3$이 집합에 들어 있다.'),(r'$A=\{2,4,6\}$의 원소가 아닌 수는?', ['2','4','5','6'],3,r'$5$는 집합에 들어 있지 않다.')]),
('value','functions',2,'함숫값 대입 계산',[(r'$f(x)=2x+1$일 때 $f(3)$은?', ['5','6','7','8'],3,r'$f(3)=2\times3+1=7$.'),(r'$f(x)=3x-2$일 때 $f(2)$는?', ['2','3','4','5'],3,r'$f(2)=3\times2-2=4$.')]),
('substitute','functions',1,'문자에 수 대입과 연산 순서',[(r'$x=2$일 때 $3x+1$의 값은?', ['4','5','6','7'],4,r'$3\times2+1=7$.'),(r'$x=-1$일 때 $2x+3$의 값은?', ['-5','-1','1','5'],3,r'$2\times(-1)+3=1$.')]),
('square','functions',1,'제곱의 값과 비음수 성질',[(r'$(3-1)^2$의 값은?', ['2','4','6','8'],2,r'$2^2=4$.'),(r'$(x-2)^2$의 최솟값은?', ['-2','-1','0','2'],3,r'실수의 제곱은 0 이상이고 $x=2$에서 0이 된다.')]),
('pythagoras','geometry',2,'피타고라스 정리와 직선의 기본형',[(r'직선 $y=-\frac34x+3$의 절편은 $(4,0),(0,3)$이다. 두 절편 사이의 길이는?', ['3','4','5','7'],3,r'가로 4, 세로 3인 직각삼각형의 빗변이다. $\sqrt{4^2+3^2}=5$.'),(r'직선 $3x+4y-12=0$을 $y=ax+b$로 나타냈을 때 $(a,b)$는?', [r'(-\frac34,3)',r'(\frac34,3)',r'(-\frac43,4)',r'(-3,12)'],1,r'$4y=-3x+12$에서 $y=-\frac34x+3$.')]),
('coords','geometry',1,'좌표 대입과 제곱 계산',[(r'점 $(2,1)$이 직선 $x+y=3$ 위에 있는가?', ['있다','없다','판단할 수 없음','좌표가 아님'],1,r'$2+1=3$이므로 직선 위에 있다.'),(r'$3^2+4^2$의 값은?', ['7','12','25','49'],3,r'$9+16=25$.')]),
('ratio','geometry',2,'선분의 내분과 비례',[(r'길이 12인 선분을 $1:2$로 나눌 때 짧은 부분의 길이는?', ['3','4','6','8'],2,r'전체를 3등분한 한 부분이므로 $12/3=4$.'),(r'수직선에서 $0$과 $9$ 사이를 $2:1$로 내분하는 점은?', ['3','4','6','9'],3,r'0에서 전체 길이의 $2/3$만큼 이동하므로 6이다.')]),
('fraction','geometry',1,'비와 분수의 계산',[(r'$12\times\frac13$은?', ['3','4','6','9'],2,r'$12/3=4$.'),(r'$9\times\frac23$은?', ['3','4','6','9'],3,r'$9/3\times2=6$.')]),
('discriminant','equations',2,'판별식의 부호와 실근 개수',[(r'$x^2+bx+c=0$에서 $D=b^2-4c$가 양수일 때 실근의 개수는?', ['0','1','2','3'],3,r'$D>0$이면 서로 다른 두 실근이 있다.'),(r'$x^2+3x+1=0$의 판별식은?', ['1','3','5','9'],3,r'$D=3^2-4\times1=5$.')]),
('eqsquare','equations',1,'제곱과 사칙연산',[(r'$5^2-16$의 값은?', ['5','7','9','11'],3,r'$25-16=9$.'),(r'$3^2-4$의 값은?', ['3','4','5','6'],3,r'$9-4=5$.')]),
('rootproduct','equations',2,'곱셈 공식과 제곱근',[(r'$(3+\sqrt2)(3-\sqrt2)$의 값은?', ['5','7','9','11'],2,r'합과 차의 곱은 제곱의 차이다. $9-2=7$.'),(r'$(2+\sqrt3)(2-\sqrt3)$의 값은?', ['1','2','3','4'],1,r'$4-3=1$.')]),
('enumerate','counting',2,'중복 없이 조합 나열',[(r'카드 $1,2,3$ 중 서로 다른 2장을 순서 없이 고르는 경우의 수는?', ['2','3','4','6'],2,r'$(1,2),(1,3),(2,3)$의 3가지.'),(r'4가지 중 서로 다른 3가지를 고르는 경우의 수는?', ['3','4','6','12'],2,r'제외할 1가지를 고르는 것과 같으므로 4가지.')]),
('countbase','counting',1,'조건에 맞는 경우 세기',[(r'$1,2,3,4$ 중 짝수는 몇 개인가?', ['1','2','3','4'],2,r'$2,4$ 두 개이다.'),(r'동전을 한 번 던질 때 가능한 결과 수는?', ['1','2','3','4'],2,r'앞면과 뒷면 두 가지이다.')]),
]
by={q['id']:q for q in b['questions']}
for slug,domain,level,name,variants in specs:
 for i,(prompt,choices,answer,sol) in enumerate(variants):
  id=f'road-{slug}-{i+1}';q={'id':id,'kind':'authored','role':'diagnostic','contentStatus':'approved','approvalScope':'local_diagnostic_content','prompt':prompt,'choices':[{'id':c,'value':str(j+1),'text':v,'latex':None if any('\uac00'<=t<='\ud7a3' for t in v) else v} for j,(c,v) in enumerate(zip('abcd',choices))],'answerFormat':'choice','answer':str(answer),'solutionSteps':[sol],'conceptIds':['road-'+slug],'domain':domain,'level':level,'difficulty':'중학·고1 연계' if level==2 else '중1~2 기초','curriculum':{'major':next(d['name'] for d in cfg['domains'] if d['id']==domain),'unit':name,'core':name},'reference':{'authored':True},'fallback_question_id':None,'prerequisite_concept':[],'confirmation_question_ids':[f'road-{slug}-{2-i}'],'review':{'method':'independent_arithmetic_and_logic_check','educatorValidated':False}}
  by[id]=q
# Explicit causal chains. Supplementary legacy nodes no longer used by diagnosis.
chains={'algebra': [('ged-high-2025-1-math-q01','like','signed'),('ged-high-2025-1-math-q03','expand','signed')], 'equations':[('ged-high-2025-1-math-q05','discriminant','eqsquare'),('ged-high-2025-1-math-q06','rootproduct','eqsquare')], 'functions':[('ged-high-2025-1-math-q07','vertex','square'),('ged-high-2025-1-math-q16','value','substitute')], 'geometry':[('ged-high-2025-1-math-q10','ratio','fraction'),('ged-high-2025-1-math-q11','pythagoras','coords')], 'logic':[('ged-high-2025-1-math-q14','intersection','member'),('ged-high-2025-1-math-q15','truthset','truth')], 'counting':[('ged-high-2025-1-math-q19','enumerate','countbase'),('ged-high-2025-1-math-q20','enumerate','countbase')]}
def pair(s):return ['astra-expand','astra-expand-check'] if s=='expand' else ['ged-middle-2025-1-math-q17','astra-quadratic-vertex'] if s=='vertex' else [f'road-{s}-1',f'road-{s}-2']
def link(id,lower):
 q=by[id];q['fallback_question_id']=lower[0] if lower else None;q['prerequisite_concept']=by[lower[0]]['conceptIds'] if lower else [];q['remedialPath']={'questionIds':lower,'reason':'직접 필요한 연산·표현·논리 선수 개념 확인'}
for d in cfg['domains']:
 levels={'3':[], '2':[], '1':[]}
 for high,mid,low in chains[d['id']]:
  mids=pair(mid);lows=pair(low);levels['3'].append(high)
  for n in mids:
   by[n]['confirmation_question_ids']=[x for x in mids if x!=n];link(n,lows)
  for n in lows:link(n,[])
  link(high,mids)
  for l,ids in [('2',mids),('1',lows)]:levels[l]=list(dict.fromkeys(levels[l]+ids))
 d['levels']=levels
active={id for d in cfg['domains'] for ids in d['levels'].values() for id in ids}
for q in by.values():
 if q.get('role')=='diagnostic' and q['id'] not in active:
  q['diagnosticUse']='supplementary';link(q['id'],[])
cfg['stageLabels']={'high_school':'고졸 본문항','prerequisite_1':'1차 하위 개념','prerequisite_2':'2차 하위 개념'}
cfg['version']=2;cfg['roadmapVersion']=1
b['questions']=list(by.values());save('questions.json',b);save('diagnostic.json',cfg)
# Synchronize the graph, including old Astra concepts whose outgoing links changed.
cb={c['id']:c for c in concepts['concepts']}
for q in by.values():
 if q.get('role')=='diagnostic':
  for id in q['conceptIds']:cb[id]={'id':id,'name':q['curriculum']['core'],'summary':q['solutionSteps'][0],'prerequisiteIds':q.get('prerequisite_concept',[])}
concepts['concepts']=list(cb.values());save('concepts.json',concepts)
print('Corrected six domains; added',sum(len(s[-1]) for s in specs),'targeted prerequisite items')
