"""Reviewed diagram bounds in reference page coordinates (1333 x 1888)."""
import json
from pathlib import Path
from PIL import Image
B=Path(__file__).resolve().parents[1];C=B/'public/src/content/questions.json'
boxes=[('high',7,1,(790,340,1015,620)),('high',10,1,(745,1495,1055,1735)),('high',11,2,(140,185,475,415)),('high',19,2,(750,1170,1180,1285)),('high',20,2,(750,1510,1180,1680)),('middle',1,1,(245,380,345,490)),('middle',5,1,(150,1140,470,1365)),('middle',6,1,(145,1490,415,1720)),('middle',7,1,(750,365,1180,535)),('middle',11,1,(720,1475,1005,1720)),('middle',12,2,(140,220,445,405)),('middle',13,2,(150,670,475,880)),('middle',14,2,(270,1080,510,1225)),('middle',17,2,(820,180,1090,415)),('middle',18,2,(825,775,1080,935)),('middle',19,2,(735,1220,1055,1450))]
bank=json.loads(C.read_text());byid={q['id']:q for q in bank['questions']}
for level,n,page,box in boxes:
 ex=f'ged-{level}-2025-1-math';folder=B/'public/assets/exams'/ex
 with Image.open(folder/f'page-{page}.png') as im:
  sx=im.width/1333;sy=im.height/1888
  im.crop(tuple(round(v*(sx if i%2==0 else sy)) for i,v in enumerate(box))).save(folder/f'figure-{n:02}.png')
 q=byid[f'{ex}-q{n:02}'];q['figure']={'src':f'/assets/exams/{ex}/figure-{n:02}.png','alt':f"{q['curriculum']['core']} 문항의 원본 도형·표",'sourcePage':page,'referenceBounds':box}
C.write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n')
