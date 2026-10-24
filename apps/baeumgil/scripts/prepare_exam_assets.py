"""Render complete source pages and lossless question-region crops for review.
Requires pdfplumber, pypdfium2, Pillow. Does not approve content or invent LaTeX.
"""
from pathlib import Path
import json, re, hashlib
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / 'data/exam-sources'
ASSETS = BASE / 'public/assets/exams'
SCALE = 2

def main():
    manifest = json.loads((SOURCE/'manifest.json').read_text())
    keys = {k['examId']: k for k in json.loads((SOURCE/'math-answer-keys.json').read_text())['keys']}
    records = []
    for exam in manifest['sources']:
        path = SOURCE/exam['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == exam['sha256']
        out = ASSETS/exam['id']
        out.mkdir(parents=True, exist_ok=True)
        pdf = pdfium.PdfDocument(str(path))
        entries = []
        with pdfplumber.open(path) as doc:
            for page_index, page in enumerate(doc.pages):
                bitmap = pdf[page_index].render(scale=SCALE)
                image = bitmap.to_pil().convert('RGB')
                image.save(out/f'page-{page_index+1}.png')
                words = page.extract_words()
                anchors = [w for w in words if re.fullmatch(r'(?:[1-9]|1[0-9]|20)\.', w['text']) and (page.width*.055 < w['x0'] < page.width*.10 or page.width*.49 < w['x0'] < page.width*.55)]
                for right in (False, True):
                    column = sorted([w for w in anchors if (w['x0'] > page.width/2) == right], key=lambda w:w['top'])
                    for i,w in enumerate(column):
                        number = int(w['text'][:-1])
                        x0 = page.width/2 if right else page.width*.045
                        x1 = page.width*.96 if right else page.width/2
                        y0 = max(0,w['top']-8)
                        y1 = column[i+1]['top']-8 if i+1<len(column) else page.height*.95
                        box = (int(x0*SCALE),int(y0*SCALE),int(x1*SCALE),int(y1*SCALE))
                        crop = image.crop(box)
                        name = f'question-{number:02}.png'
                        crop.save(out/name)
                        raw = page.crop((x0,y0,x1,y1)).extract_text() or ''
                        entries.append({'questionNumber':number,'page':page_index+1,'bbox':[x0,y0,x1,y1],'image':f'/assets/exams/{exam["id"]}/{name}','pageImage':f'/assets/exams/{exam["id"]}/page-{page_index+1}.png','rawText':raw,'containsPUA':any('\ue000'<=c<='\uf8ff' for c in raw)})
                image.close()
        pdf.close()
        numbers=sorted(e['questionNumber'] for e in entries)
        assert numbers==list(range(1,21)), (exam['id'],numbers)
        answer_map={a['questionNumber']:a['choiceNumber'] for a in keys[exam['id']]['answers']}
        for e in entries:
            e.update({'id':f'{exam["id"]}-q{e["questionNumber"]:02}','examId':exam['id'],'correctChoiceNumber':answer_map[e['questionNumber']],'answerKeyStatus':keys[exam['id']]['status'],'contentStatus':'pending','reviewStatus':'needs_visual_and_math_review','latex':None,'conceptIds':[],'solutionSteps':[],'remedialRouteId':None})
        records.extend(entries)
        print(exam['id'],len(entries),'question crops',flush=True)
    for r in records:
        for field in ('image','pageImage'):
            with Image.open(BASE/'public'/r[field].lstrip('/')) as im: im.verify()
    result={'schemaVersion':1,'assetKind':'complete_question_region_including_diagrams_and_choices','questions':records}
    (SOURCE/'question-drafts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(f'Validated {len(records)} question assets and answer mappings; original bank unchanged.')

if __name__ == '__main__': main()
