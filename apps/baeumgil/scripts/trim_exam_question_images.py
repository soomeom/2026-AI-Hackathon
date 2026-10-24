"""문항 이미지를 원본 페이지에서 다시 잘라 바닥글(기관 로고·쪽 표시)과 가운데 세로 구분선을 뺀다.
prepare_exam_assets.py 가 만든 page-*.png 와 question-drafts.json 의 bbox 를 그대로 쓰므로 반복 실행해도 결과가 같다.
필요: Pillow. 실행: py -3 scripts/trim_exam_question_images.py
"""
from pathlib import Path
import json
from PIL import Image

BASE = Path(__file__).resolve().parents[1]
PUBLIC = BASE / 'public'
SCALE = 2          # prepare_exam_assets.py 의 렌더링 배율
DARK = 140         # 이 밝기보다 어두우면 선/글자로 본다
PAD = 14           # 잘라 낸 뒤 아래쪽 여백(px)


def dark_ratio_row(img, y, x0, x1):
    px = img.load()
    return sum(1 for x in range(x0, x1, 2) if px[x, y] < DARK) / max(1, (x1 - x0) // 2)


def dark_ratio_col(img, x, y0, y1):
    px = img.load()
    return sum(1 for y in range(y0, y1, 2) if px[x, y] < DARK) / max(1, (y1 - y0) // 2)


def page_layout(page):
    """바닥글 가로줄의 y(페이지 폭 대부분을 가로지르는 선)와 가운데 세로 구분선의 x 를 찾는다."""
    g = page.convert('L')
    w, h = g.size
    footer = h
    for y in range(int(h * 0.80), int(h * 0.97)):
        if dark_ratio_row(g, y, int(w * 0.05), int(w * 0.95)) > 0.75:
            footer = y
            break
    divider = None
    best = 0.0
    for x in range(int(w * 0.46), int(w * 0.54)):
        r = dark_ratio_col(g, x, int(h * 0.10), int(h * 0.80))
        if r > best:
            best, divider = r, x
    return footer, (divider if best > 0.6 else None)


def trim_bottom(img):
    """아래쪽의 빈 줄을 걷어 내고 여백만 남긴다."""
    g = img.convert('L')
    w, h = g.size
    px = g.load()
    last = 0
    for y in range(h):
        if any(px[x, y] < DARK for x in range(0, w, 2)):
            last = y
    return img.crop((0, 0, w, min(h, last + PAD)))


def main():
    drafts = json.loads((BASE / 'data/exam-sources/question-drafts.json').read_text(encoding='utf-8'))['questions']
    layouts, changed = {}, 0
    for q in drafts:
        page_path = PUBLIC / q['pageImage'].lstrip('/')
        if page_path not in layouts:
            with Image.open(page_path) as p:
                layouts[page_path] = (page_layout(p), p.size)
        (footer, divider), (pw, ph) = layouts[page_path]
        x0, y0, x1, y1 = [int(v * SCALE) for v in q['bbox']]
        right_column = x0 >= pw // 2 - 4
        if not right_column and divider:
            x1 = min(x1, divider - 6)
        else:
            x0 = max(x0, (divider or x0) + 6) if right_column and divider and x0 <= divider + 6 else x0
        y1 = min(y1, footer - 6)
        with Image.open(page_path) as p:
            crop = trim_bottom(p.convert('RGB').crop((x0, y0, x1, y1)))
        out = PUBLIC / q['image'].lstrip('/')
        crop.save(out)
        changed += 1
    found = sum(1 for (f, d), (w, h) in layouts.values() if f < h)
    print(f'{changed} question images re-cropped; footer line found on {found}/{len(layouts)} pages')


if __name__ == '__main__':
    main()
