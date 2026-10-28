#!/usr/bin/env python3
"""Build the backdrop of 健康素食保衛戰 (one screen, the camera is locked there) from the AI-generated source art-src/bg-street.png.

The picture is shrunk to the 256x224 screen as it is (so it has to be drawn with the street on its lower part, the way the
prompt in art-src/PROMPTS-street.md asks), and reduced to a small palette. The walkable ground of the street is the same as on
the Tokaido (rows 140..208); the shop owner stands at x 206, y 152, and the shop's blank signboard can be given here, in
256x224 screen pixels, so that the game writes 健康素食 on it:

    python3 tools/build_street.py [--sign X Y W H] [--preview preview_street.png]

writes assets/gen/bg_street.png and the "_street" entry of assets/manifest.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'bg-street.png'
OUT = ROOT / 'assets' / 'gen'
MANIFEST = ROOT / 'assets' / 'manifest.json'

SCREEN_W, SCREEN_H = 256, 224
COLORS = 56
GROUND = (140, 208)


def build():
    src = Image.open(SRC) if SRC.exists() else None
    if src is None:
        for ext in ('jpg', 'jpeg'):
            alt = SRC.with_suffix('.' + ext)
            if alt.exists():
                src = Image.open(alt)
                break
    if src is None:
        sys.exit(f'{SRC} not found')
    src = src.convert('RGB')
    # the screen is 8:7; a picture of another shape is cut to it around its middle, keeping the bottom
    want = SCREEN_W / SCREEN_H
    w, h = src.size
    if w / h > want:
        nw = round(h * want)
        src = src.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < want:
        nh = round(w / want)
        src = src.crop((0, h - nh, w, h))
    out = src.resize((SCREEN_W, SCREEN_H), Image.BOX)
    return out.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = build()
    img.save(OUT / 'bg_street.png', optimize=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    entry = {'image': 'gen/bg_street.png', 'w': SCREEN_W, 'h': SCREEN_H, 'groundMin': GROUND[0], 'groundMax': GROUND[1]}
    if '--sign' in sys.argv:
        i = sys.argv.index('--sign')
        x, y, w, h = (int(v) for v in sys.argv[i + 1:i + 5])
        entry['sign'] = {'x': x, 'y': y, 'w': w, 'h': h}
    manifest['_street'] = entry
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('street', img.size, 'ground', GROUND, 'sign', entry.get('sign'))
    if '--preview' in sys.argv:
        prev = Path(sys.argv[sys.argv.index('--preview') + 1])
        big = img.resize((SCREEN_W * 4, SCREEN_H * 4), Image.NEAREST)
        a = np.asarray(big).copy()
        for y in (GROUND[0] * 4, GROUND[1] * 4):
            a[y:y + 2, :] = (255, 0, 255)
        # where the shop owner stands
        a[152 * 4 - 40:152 * 4, 206 * 4 - 2:206 * 4 + 2] = (0, 255, 255)
        if 'sign' in entry:
            s = entry['sign']
            a[s['y'] * 4:(s['y'] + s['h']) * 4, s['x'] * 4:(s['x'] + s['w']) * 4, 0] = 255
        Image.fromarray(a).save(prev)


if __name__ == '__main__':
    main()
