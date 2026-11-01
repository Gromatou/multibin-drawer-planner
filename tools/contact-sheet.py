#!/usr/bin/env python3
import json, os, sys, math
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'tests', 'out'))
report = json.load(open(os.path.join(OUT, 'report.json')))
items = []
for r in report:
    if not r.get('ok'): continue
    for suff in ['3d', 'top']:
        p = os.path.join(OUT, f"{r['id']}-{suff}.png")
        if os.path.exists(p): items.append((r, suff, p))

THUMB_W, THUMB_H = 260, 190
LABEL_H = 44
COLS = 6
ROWS = 5
per = COLS * ROWS
sheets = math.ceil(len(items) / per)
for si in range(sheets):
    chunk = items[si*per:(si+1)*per]
    W = COLS * THUMB_W
    H = ROWS * (THUMB_H + LABEL_H)
    im = Image.new('RGB', (W, H), (10, 15, 26))
    d = ImageDraw.Draw(im)
    for i, (r, suff, p) in enumerate(chunk):
        c = i % COLS; rr = i // COLS
        x = c * THUMB_W; y = rr * (THUMB_H + LABEL_H)
        try:
            th = Image.open(p).convert('RGB')
            th.thumbnail((THUMB_W-6, THUMB_H-6))
            im.paste(th, (x + (THUMB_W-th.width)//2, y + (THUMB_H-th.height)//2))
        except Exception:
            pass
        dx = x + 4; dy = y + THUMB_H + 4
        bad = any((not s.get('gridAligned')) or s.get('overhangMax',0)>0.01 for s in r.get('stacksDetail',[]))
        col = (255, 120, 120) if bad else (150, 230, 170)
        d.text((dx, dy), f"{r['id']} {r['type']} {r['w']}x{r['d']}", fill=col)
        d.text((dx, dy+14), f"sym={int(r['sym'])} edge={int(r['edge'])} {r['mode']} {suff}", fill=(180, 195, 220))
        d.text((dx, dy+28), f"bad={int(bad)} layers={len(r.get('stacksDetail',[]))}", fill=col)
    out = os.path.join(OUT, f'contact-{si+1}.png')
    im.save(out)
    print(out, len(chunk))
