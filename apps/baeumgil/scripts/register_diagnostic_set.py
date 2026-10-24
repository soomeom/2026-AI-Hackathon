"""Idempotently register visually transcribed 2025-1 representative questions.
The hand-reviewed transcription is the input, never raw PUA substitution.
"""
import json
from pathlib import Path
from PIL import Image
B=Path(__file__).resolve().parents[1]; C=B/'public/src/content'; D=B/'data/exam-sources'
# level, number, domain, curriculum tier, concept, prompt ($ delimiters), choices, explanation
rows=[
('h',1,'algebra',3,'다항식의 덧셈',r'두 다항식 $A=2x^2+3x$, $B=ax^2+x$에 대하여 $A+B=bx$일 때, 두 상수 $a$와 $b$의 합은?', ['-2','0','2','4'],r'$A+B=(2+a)x^2+4x$이므로 $a=-2$, $b=4$. 따라서 $a+b=2$.'),
('h',3,'algebra',3,'인수분해',r'다항식 $x^3+8$을 인수분해한 식이 $(x+2)(x^2+ax+4)$일 때, 상수 $a$의 값은?', ['-2','-1','1','2'],r'합의 세제곱 인수분해 공식으로 $x^3+2^3=(x+2)(x^2-2x+4)$이므로 $a=-2$.'),
('h',5,'equations',3,'판별식',r'이차방정식 $x^2+ax+4=0$이 서로 다른 두 실근을 가질 때, 자연수 $a$의 최솟값은?', ['4','5','6','7'],r'판별식 $D=a^2-16>0$. 자연수 $a$는 $4$보다 커야 하므로 최솟값은 $5$.'),
('h',6,'equations',3,'근과 계수의 관계',r'이차방정식 $x^2-4x+a=0$의 두 근이 $2+\sqrt{2}$, $2-\sqrt{2}$일 때, 상수 $a$의 값은?', ['2','4','6','8'],r'두 근의 곱이 $a$이다. $a=(2+\sqrt{2})(2-\sqrt{2})=4-2=2$.'),
('h',7,'functions',3,'이차함수의 최솟값',r'$-1\le x\le2$일 때, 이차함수 $y=(x-1)^2+2$의 최솟값은?', ['-1','0','1','2'],r'구간 안의 $x=1$에서 $(x-1)^2=0$이므로 최솟값은 $2$.'),
('h',16,'functions',3,'합성함수',r'두 함수 $f(x)=3x-1$, $g(x)=-2x+5$에 대하여 $(g\circ f)(1)$의 값은?', ['-3','-1','1','3'],r'$f(1)=2$이므로 $g(f(1))=g(2)=-4+5=1$.'),
('h',10,'geometry',3,'선분의 내분',r'좌표평면 위의 두 점 $A(-3,5)$, $B(6,-1)$에 대하여 선분 $AB$를 $1:2$로 내분하는 점의 좌표는?', ['(0,3)','(1,2)','(3,1)','(4,0)'],r'내분점은 $\left(\frac{2(-3)+6}{3},\frac{2(5)-1}{3}\right)=(0,3)$.'),
('h',11,'geometry',3,'점과 직선 사이의 거리',r'원점과 직선 $3x+4y-12=0$ 사이의 거리는?', [r'\frac{11}{5}',r'\frac{12}{5}',r'\frac{13}{5}',r'\frac{14}{5}'],r'거리 공식에 따라 $\frac{|3(0)+4(0)-12|}{\sqrt{3^2+4^2}}=\frac{12}{5}$.'),
('h',14,'logic',3,'집합의 연산',r'두 집합 $A=\{1,3,5,7,9\}$, $B=\{3,4,5,6\}$에 대하여 $n(A\cup B)+n(A\cap B)$의 값은?', ['6','7','8','9'],r'$A\cup B=\{1,3,4,5,6,7,9\}$, $A\cap B=\{3,5\}$. 따라서 $7+2=9$.'),
('h',15,'logic',3,'필요조건',r'두 조건 $p:x-3=0$, $q:x^2-ax-3=0$에 대하여 $q$가 $p$이기 위한 필요조건이 되도록 하는 상수 $a$의 값은?', ['0','2','4','6'],r'$p\Rightarrow q$여야 한다. $x=3$을 $q$에 대입하면 $9-3a-3=0$이므로 $a=2$.'),
('h',19,'counting',3,'경우의 수',r'숫자 $1,2,3,4,5$가 각각 적힌 카드 5장 중 2장을 동시에 뽑을 때, 카드에 적힌 수의 합이 3의 배수인 경우의 수는?', ['3','4','5','6'],r'조건을 만족하는 쌍은 $(1,2),(1,5),(2,4),(4,5)$로 $4$가지이다.'),
('h',20,'counting',3,'조합',r'그림과 같이 아이스크림 위에 올릴 토핑 5종류가 있다. 이 중에서 서로 다른 토핑 4개를 선택하는 경우의 수는?', ['1','5','10','15'],r'제외할 토핑 1개를 고르는 것과 같으므로 $\binom{5}{4}=5$가지이다.'),
('m',1,'algebra',1,'소인수분해',r'다음은 $45$를 소인수분해하는 과정을 나타낸 것이다. $45$를 소인수분해한 결과로 옳은 것은?', ['3^2',r'3\times5',r'3^2\times5',r'3^2\times5^2'],r'$45=3\times15=3\times3\times5=3^2\times5$.'),
('m',2,'algebra',1,'정수의 덧셈',r'$6+(-4)$를 계산한 값은?', ['1','2','3','4'],r'음수를 더하는 것은 그 절댓값을 빼는 것이다. $6-4=2$.'),
('m',3,'algebra',1,'문자와 식',r'한 송이에 $2000$원인 장미꽃 $a$송이의 가격을 문자가 사용된 식으로 바르게 나타낸 것은?', ['(2000+a)', '(2000-a)',r'(2000\times a)',r'(2000\div a)'],r'한 송이 가격에 송이 수를 곱하므로 $2000\times a$원이다.'),
('m',4,'equations',1,'일차방정식',r'일차방정식 $2x-3=5$의 해는?', ['3','4','5','6'],r'$2x=8$이므로 $x=4$.'),
('m',5,'functions',1,'그래프 읽기',r'다음은 5km 단축 마라톤 대회에 참가한 어느 학생의 시간에 따른 이동 거리를 나타낸 그래프이다. 출발한 후 10분부터 25분까지 이동한 거리는?', [r'2\mathrm{km}',r'3\mathrm{km}',r'4\mathrm{km}',r'5\mathrm{km}'],r'10분에는 $2$km, 25분에는 $4$km이므로 $4-2=2$km.'),
('m',6,'geometry',1,'부채꼴과 비례',r'원 $O$에서 부채꼴 $AOB$의 넓이는 $3\mathrm{cm}^2$, 부채꼴 $COD$의 넓이는 $5\mathrm{cm}^2$이다. $\angle AOB=60^\circ$일 때, $\angle COD$의 크기는?', [r'90^\circ',r'100^\circ',r'110^\circ',r'120^\circ'],r'같은 원에서 넓이는 중심각에 비례한다. $60\times\frac{5}{3}=100^\circ$.'),
('m',7,'statistics',1,'상대도수',r'학생 20명의 통학 시간을 조사한 표이다. 10분 이상 20분 미만인 학생은 12명이다. 이 구간의 상대도수 $a$의 값은?', ['0.5','0.6','0.7','0.8'],r'상대도수는 해당 도수를 전체 도수로 나눈 값이다. $a=12/20=0.6$.'),
('m',9,'algebra',1,'지수법칙',r'$a^2\times a^7\div a^3$을 간단히 한 것은? (단, $a\ne0$)', ['a^4','a^5','a^6','a^7'],r'같은 밑의 곱셈은 지수를 더하고 나눗셈은 뺀다. $a^{2+7-3}=a^6$.'),
('m',10,'equations',1,'연립일차방정식',r'연립방정식 $\begin{cases}x-y=1\\2x-y=3\end{cases}$의 해는?', ['x=1,y=1','x=2,y=1','x=3,y=2','x=4,y=3'],r'아래 식에서 위 식을 빼면 $x=2$. $2-y=1$에서 $y=1$.'),
('m',11,'functions',1,'일차함수의 기울기',r'그림은 일차함수 $y=ax+4$의 그래프이다. 상수 $a$의 값은?', ['2','3','4','5'],r'그래프가 $(-2,0)$을 지나므로 $0=-2a+4$. 따라서 $a=2$.'),
('m',12,'geometry',1,'이등변삼각형',r'$AB=AC$인 이등변삼각형 $ABC$에서 $\angle A=80^\circ$일 때, 그림의 외각 $x$의 크기는?', [r'130^\circ',r'140^\circ',r'150^\circ',r'160^\circ'],r'밑각은 $(180-80)/2=50^\circ$. 외각은 $180-50=130^\circ$.'),
('m',13,'geometry',1,'삼각형의 닮음',r'삼각형 $ABC$에서 $BC$와 평행한 직선이 $AB,AC$와 만나는 점을 $D,E$라 하자. $AD=6\mathrm{cm}$, $DB=3\mathrm{cm}$, $AE=8\mathrm{cm}$, $EC=x\mathrm{cm}$일 때, $x$의 값은?', ['1','2','3','4'],r'평행선에 의해 $AD:DB=AE:EC$이다. $6:3=8:x$이므로 $6x=24$, $x=4$.'),
('m',14,'counting',1,'확률',r'1부터 10까지의 자연수가 적힌 공 10개 중 임의로 한 개를 꺼낼 때, 5의 배수가 나올 확률은?', [r'\frac15',r'\frac3{10}',r'\frac25',r'\frac12'],r'5의 배수는 $5,10$ 두 개이므로 $2/10=1/5$.'),
('m',15,'equations',2,'제곱근',r'$2\sqrt5=\sqrt a$일 때, $a$의 값은?', ['10','15','20','25'],r'양변을 제곱하면 $a=2^2\times5=20$.'),
('m',16,'equations',2,'이차방정식의 인수분해',r'이차방정식 $x^2-3x+2=0$의 한 근이 1이다. 다른 한 근은?', ['2','3','4','5'],r'$(x-1)(x-2)=0$이므로 두 근은 $1,2$이다.'),
('m',17,'functions',2,'이차함수의 꼭짓점',r'이차함수 $y=x^2+2$의 그래프에 대한 설명으로 옳은 것은?', ['위로 볼록하다.','점 $(1,4)$를 지난다.','직선 $y=1$을 축으로 한다.','꼭짓점의 좌표는 $(0,2)$이다.'],r'$y=x^2$를 위로 2만큼 옮긴 그래프이다. 꼭짓점은 $(0,2)$, 축은 $x=0$이며 아래로 볼록하다.'),
('m',18,'geometry',2,'삼각비',r'직각삼각형 $ABC$에서 $AB=8$, $BC=17$, $CA=15$일 때, $\sin B$의 값은?', [r'\frac8{17}',r'\frac8{15}',r'\frac{15}{17}',r'\frac{15}{8}'],r'빗변은 $BC$, 각 $B$의 대변은 $CA$이다. $\sin B=CA/BC=15/17$.'),
('m',19,'geometry',2,'원의 접선',r'두 점 $A,B$는 점 $P$에서 원 $O$에 그은 두 접선의 접점이다. $PB=5\mathrm{cm}$, $\angle PBA=60^\circ$일 때, $AB$의 길이는?', [r'5\mathrm{cm}',r'6\mathrm{cm}',r'7\mathrm{cm}',r'8\mathrm{cm}'],r'$PA=PB$이므로 삼각형 $PAB$는 이등변삼각형이다. 밑각이 $60^\circ$이므로 정삼각형이며 $AB=5$cm.'),
('m',20,'statistics',2,'자료의 산포',r'다음 중 표준편차가 가장 큰 자료는?', ['1,1,1,1,1','1,2,1,2,1','2,3,2,3,2','2,4,2,4,2'],r'①은 산포가 0이다. ②와 ③의 분산은 $0.24$, ④의 분산은 $0.96$이므로 ④의 표준편차가 가장 크다.'),
]
# Add foundational authored questions for concepts not covered by the middle-school paper.
custom=[
('set-basic','logic',1,'집합의 원소',r'$A=\{1,2,3\}$, $B=\{2,3,4\}$일 때 $A\cap B$는?', [r'\{1,4\}',r'\{2,3\}',r'\{1,2,3,4\}',r'\varnothing'],2,r'두 집합에 공통으로 들어 있는 원소 $2,3$을 모은다.'),
('set-count','logic',1,'조건에 맞는 원소 세기',r'$1,2,3,4,5,6$ 중 짝수의 개수는?', ['2','3','4','6'],2,r'짝수는 $2,4,6$이므로 3개이다.'),
('count-basic','counting',1,'경우 나열',r'동전 한 개를 두 번 던질 때 가능한 결과는 모두 몇 가지인가?', ['2','3','4','6'],3,r'앞앞, 앞뒤, 뒤앞, 뒤뒤로 4가지이다.'),
('count-one','counting',1,'전체와 조건의 개수',r'숫자 $1,2,3,4$가 적힌 카드에서 한 장을 뽑을 때 홀수가 나올 확률은?', [r'\frac14',r'\frac12',r'\frac34','1'],2,r'홀수는 $1,3$ 두 장이다. 전체 4장 중 2장이므로 $1/2$.'),
('quadratic-vertex','functions',2,'이차함수의 꼭짓점',r'$y=(x-2)^2+3$의 꼭짓점은?', ['(2,3)','(-2,3)','(2,-3)','(3,2)'],1,r'제곱항이 0인 $x=2$에서 $y=3$이다.'),
('expand','algebra',2,'인수분해',r'$x^2+5x+6$을 인수분해한 것은?', ['(x+1)(x+6)','(x+2)(x+3)','(x-2)(x-3)','(x+2)(x-3)'],2,r'합이 5, 곱이 6인 두 수는 2와 3이다.'),
('expand-check','algebra',2,'인수분해',r'$x^2-9$를 인수분해한 것은?', ['(x-3)^2','(x+3)^2','(x-3)(x+3)','(x-9)(x+1)'],3,r'제곱의 차 공식 $a^2-b^2=(a-b)(a+b)$를 적용한다.'),
]
NAMES={'algebra':'수와 다항식','equations':'방정식과 부등식','functions':'함수와 그래프','geometry':'도형과 좌표','logic':'집합과 명제','counting':'경우의 수와 확률','statistics':'통계'}
def qid(l,n):return f'ged-{"high" if l=="h" else "middle"}-2025-1-math-q{n:02}'
keys=json.loads((D/'math-answer-keys.json').read_text()); km={k['examId']:{a['questionNumber']:a['choiceNumber'] for a in k['answers']} for k in keys['keys']}
drafts={q['id']:q for q in json.loads((D/'question-drafts.json').read_text())['questions']}
questions=[]
def build(id,domain,tier,concept,prompt,choices,correct,solution):
 cs=[{'id':c,'value':str(i+1),'latex':(v if '$' not in v and not any('\uac00'<=x<='\ud7a3' for x in v) else None),'text':v} for i,(c,v) in enumerate(zip('abcd',choices))]
 return {'id':id,'kind':'authored','role':'diagnostic','contentStatus':'approved','approvalScope':'local_diagnostic_content','prompt':prompt,'answerFormat':'choice','choices':cs,'answer':str(correct),'solutionSteps':[solution],'conceptIds':[f'astra-{domain}-l{tier}-{concept}'],'domain':domain,'level':tier,'difficulty':{1:'기초',2:'중간',3:'고졸 핵심'}[tier],'curriculum':{'major':NAMES[domain],'unit':concept,'core':concept},'prerequisite_concept':[],'fallback_question_id':None,'review':{'method':'source_visual_comparison_and_independent_solution','reviewer':'Codex','date':'2026-10-24','educatorValidated':False},'reference':{'authored':True},'remedialPath':{'questionIds':[],'reason':'해당 세트의 최하위 확인 또는 보조 문항'}}
for l,n,domain,tier,concept,prompt,choices,sol in rows:
 id=qid(l,n);ex=id.rsplit('-q',1)[0];q=build(id,domain,tier,concept,prompt,choices,km[ex][n],sol);q['kind']='official';q['reference']={'institution':'한국교육과정평가원','year':2025,'session':1,'qualification':'고졸' if l=='h' else '중졸','questionNumber':n,'answerStatus':'final','sourceUrl':'https://www.kice.re.kr','sourceUrlScope':'institution_homepage','providedFile':ex,'usageReviewStatus':'unverified','transcription':'수식 전사 및 일부 발문 의미 보존 편집'};q['sourceImage']=drafts[id]['image'];questions.append(q)
for slug,domain,tier,concept,prompt,choices,correct,sol in custom:questions.append(build('astra-'+slug,domain,tier,concept,prompt,choices,correct,sol))
# Diagnose six high-school strands; statistics is available as supplementary bank content.
plans=[('algebra',[qid('h',1),qid('h',3)],['astra-expand','astra-expand-check'],[qid('m',9),qid('m',3),qid('m',2),qid('m',1)]),('equations',[qid('h',5),qid('h',6)],[qid('m',16),qid('m',15)],[qid('m',4),qid('m',10)]),('functions',[qid('h',7),qid('h',16)],[qid('m',17),'astra-quadratic-vertex'],[qid('m',11),qid('m',5)]),('geometry',[qid('h',10),qid('h',11)],[qid('m',18),qid('m',19)],[qid('m',13),qid('m',12),qid('m',6)]),('logic',[qid('h',14),qid('h',15)],[],['astra-set-basic','astra-set-count']),('counting',[qid('h',19),qid('h',20)],[],[qid('m',14),'astra-count-basic','astra-count-one'])]
byid={q['id']:q for q in questions}; domains=[]
for d,high,mid,low in plans:
 groups={'3':high,'2':mid,'1':low}
 for tier,ids in groups.items():
  lower=mid or low if tier=='3' else low if tier=='2' else []
  for id in ids:
   q=byid[id];q['fallback_question_id']=lower[0] if lower else None;q['prerequisite_concept']=byid[lower[0]]['conceptIds'] if lower else [];q['remedialPath']={'questionIds':lower,'reason':'관련 선수 개념의 수행을 직접 확인'}
 domains.append({'id':d,'name':NAMES[d],'levels':groups,'rootQuestionId':high[0]})
# Safe merge preserves all pre-existing authored learning questions.
bank=json.loads((C/'questions.json').read_text());ids=set(byid);bank['questions']=[q for q in bank['questions'] if q['id'] not in ids]+questions
(C/'questions.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n')
concepts=json.loads((C/'concepts.json').read_text());concepts['concepts']=[c for c in concepts['concepts'] if not c['id'].startswith('astra-')];existing={c['id'] for c in concepts['concepts']}
for q in questions:
 id=q['conceptIds'][0]
 if id not in existing:concepts['concepts'].append({'id':id,'name':q['curriculum']['core'],'summary':q['solutionSteps'][0],'prerequisiteIds':q['prerequisite_concept']});existing.add(id)
(C/'concepts.json').write_text(json.dumps(concepts,ensure_ascii=False,indent=2)+'\n')
(C/'diagnostic.json').write_text(json.dumps({'version':1,'domains':domains,'maxQuestions':30,'minimumIndependentCorrect':2},ensure_ascii=False,indent=2)+'\n')
for k in keys['keys']:
 if k['examId'] in ['ged-high-2025-1-math','ged-middle-2025-1-math']:k['reviewStatus']='visual_verified';k['reviewedOn']='2026-10-24'
(D/'math-answer-keys.json').write_text(json.dumps(keys,ensure_ascii=False,indent=2)+'\n')
print('Registered',len(questions),'diagnostic questions')

import subprocess,sys
subprocess.run([sys.executable,str(B/'scripts/crop_diagnostic_figures.py')],check=True)

reviews=json.loads((C/'review.json').read_text())
reviews['reviews']=[r for r in reviews['reviews'] if r['questionId'] not in ids]
for q in questions:
 reviews['reviews'].append({'questionId':q['id'],'reviewers':['Codex'],'reviewedOn':'2026-10-24','scope':'local_diagnostic_transcription','checks':{'answerVerified':True,'singleCorrectAnswer':True,'authoredNotCopied':q['kind']=='authored','visualCompared':q['kind']=='official','latexParsed':True},'educatorValidated':False})
(C/'review.json').write_text(json.dumps(reviews,ensure_ascii=False,indent=2)+'\n')
draftfile=D/'question-drafts.json';draftdata=json.loads(draftfile.read_text())
for q in draftdata['questions']:
 if q['id'] in ids:q['importStatus']='registered';q['canonicalQuestionId']=q['id'];q['canonicalContentFile']='public/src/content/questions.json'
draftfile.write_text(json.dumps(draftdata,ensure_ascii=False,indent=2)+'\n')

# Reapply reviewed per-concept prerequisite links after transcription, then sync the embedded app config.
subprocess.run(["node",str(B/"scripts/build-diagnostic-roadmap.mjs")],check=True)
subprocess.run(["node",str(B/"scripts/build-exam-bank.mjs")],check=True)
