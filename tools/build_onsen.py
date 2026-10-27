#!/usr/bin/env python3
"""Build the 溫泉關 backdrop (one screen, the camera is locked there) from the AI-generated source art-src/bg-onsen.png.

The source has a thin path; the arena needs half of the usual walking depth. So the picture is cut into horizontal bands and
the sand band between the two fences is stretched, while the fences and everything else keep close to their natural size:

    sky + mountains + hut + cart   (a little squashed)
    upper fence
    sand: the walkable ground      (stretched to GROUND rows)
    lower fence
    cliff + steam + hot spring     (squashed to fit)

writes assets/gen/bg_onsen.png and the "_onsen" entry of assets/manifest.json.

    python3 tools/build_onsen.py [--preview preview_onsen.png]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'bg-onsen.png'
OUT = ROOT / 'assets' / 'gen'
MANIFEST = ROOT / 'assets' / 'manifest.json'

SCREEN_W, SCREEN_H = 256, 224
COLORS = 48

# (source rows from, to) -> (screen rows from, to). Source rows were measured on the 1341x1173 picture.
BANDS = [
    ((0, 575), (0, 104)),       # sky, mountains, hut, cart
    ((575, 605), (104, 110)),   # upper fence
    ((605, 636), (110, 142)),   # the sand path: this is where heroes and enemies walk
    ((636, 688), (142, 150)),   # lower fence
    ((688, 1173), (150, 224)),  # cliff, steam, hot spring
]
GROUND = (BANDS[2][1][0] + 2, BANDS[2][1][1] - 2)  # feet stay inside the sand


def build():
    src = Image.open(SRC).convert('RGB')
    out = Image.new('RGB', (SCREEN_W, SCREEN_H))
    for (s0, s1), (d0, d1) in BANDS:
        band = src.crop((0, s0, src.width, s1)).resize((SCREEN_W, d1 - d0), Image.BOX)
        out.paste(band, (0, d0))
    q = out.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    return q


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = build()
    img.save(OUT / 'bg_onsen.png', optimize=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    manifest['_onsen'] = {'image': 'gen/bg_onsen.png', 'w': SCREEN_W, 'h': SCREEN_H, 'groundMin': GROUND[0], 'groundMax': GROUND[1]}
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('onsen', img.size, 'ground', GROUND)
    if '--preview' in sys.argv:
        prev = Path(sys.argv[sys.argv.index('--preview') + 1])
        big = img.resize((SCREEN_W * 4, SCREEN_H * 4), Image.NEAREST)
        # mark the walkable band
        a = np.asarray(big).copy()
        for y in (GROUND[0] * 4, GROUND[1] * 4):
            a[y : y + 2, :] = (255, 0, 255)
        Image.fromarray(a).save(prev)


if __name__ == '__main__':
    main()
