#!/usr/bin/env python3
"""Cut the pictures of the divine weapons out of their generated sheets in art-src/ and shrink them to game size.

  icons-bow.jpg   -> icon_8.png (遠古長弓, upright) and icon_arrow.png (靈氣箭, pointing right)
  icon-naginata.jpg -> icon_9.png  (鬼火雙頭薙刀, lying)
  icon-raikiri.jpg  -> icon_10.png (雷切, lying)

and writes the "_icons" entry of assets/manifest.json: {"8": {image, w, h}, ..., "arrow": {...}}.
The pictures are used for the weapons lying on the ground and for the flying arrows.

    python3 tools/build_icons.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'assets' / 'gen'
MANIFEST = ROOT / 'assets' / 'manifest.json'
COLORS = 28

# (source file, crop box or None, size of the longer side in game pixels, rotate degrees clockwise, output name)
ICONS = [
    ('icons-bow.jpg', (90, 20, 275, 750), 36, 0, '8'),
    ('icons-bow.jpg', (325, 190, 405, 630), 26, -90, 'arrow'),
    ('icon-naginata.jpg', None, 54, 0, '9'),
    ('icon-raikiri.jpg', None, 46, 0, '10'),
]


def foreground(a: np.ndarray) -> np.ndarray:
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a.astype(np.float32) - bg) ** 2).sum(-1))
    return d > 90


def build(file, box, size, rot, name):
    im = Image.open(SRC / file).convert('RGB')
    if box:
        im = im.crop(box)
    a = np.asarray(im)
    mask = foreground(a)
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([a, (mask * 255).astype(np.uint8)])[y0:y1, x0:x1]
    img = Image.fromarray(rgba, 'RGBA')
    if rot:
        img = img.rotate(rot, expand=True, resample=Image.NEAREST)
    k = size / max(img.size)
    small = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.BOX)
    arr = np.asarray(small).copy()
    solid = arr[..., 3] >= 128
    arr[..., 3] = np.where(solid, 255, 0)
    # a limited palette keeps it looking like the rest of the sprites
    px = arr[solid][:, :3][None, :, :]
    q = Image.fromarray(px, 'RGB').quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    arr[solid, :3] = np.asarray(q)[0]
    out = Image.fromarray(arr, 'RGBA')
    out.save(OUT / f'icon_{name}.png', optimize=True)
    return name, {'image': f'gen/icon_{name}.png', 'w': out.width, 'h': out.height}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    icons = dict(build(*spec) for spec in ICONS)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    manifest['_icons'] = icons
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    for k, v in icons.items():
        print(k, v['w'], 'x', v['h'])


if __name__ == '__main__':
    main()
