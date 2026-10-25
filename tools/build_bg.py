#!/usr/bin/env python3
"""Build the parallax background layers from the AI-generated sources in art-src/.

  bg-sky.jpg   -> assets/gen/bg_sky.png    far layer: sky, Mt. Fuji, hills (scrolls slowly)
  bg-town.jpg  -> \
  bg-pines.jpg -> /  assets/gen/bg_mid.png  middle layer: townhouses, then Tokaido pines
  bg-road.jpg  -> assets/gen/bg_road.png   ground tile (repeats horizontally, scrolls with the camera)

and writes the "_backdrop" entry of assets/manifest.json (the sprite sheets are left alone).

    python3 tools/build_bg.py [--preview preview_bg.png]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'assets' / 'gen'
MANIFEST = ROOT / 'assets' / 'manifest.json'

SCREEN_W, SCREEN_H = 256, 224
HORIZON = 128          # the road starts here (the old placeholder background used the same)
STAGE_CAM_MAX = 1024   # STAGE_W - SCREEN_W

SKY_PARALLAX = 0.1
MID_PARALLAX = 0.5


def load(name):
    return np.asarray(Image.open(SRC / name).convert('RGB')).astype(np.float32)


def box_resize(chan, size):
    return np.asarray(Image.fromarray(chan.astype(np.float32), 'F').resize(size, Image.BOX))


def shrink(rgb, mask, size):
    """Area-average downscale that only averages opaque pixels, so keyed-out colours never bleed in."""
    m = mask.astype(np.float32)
    cov = box_resize(m, size)
    out = np.zeros((size[1], size[0], 3), np.float32)
    for c in range(3):
        out[:, :, c] = box_resize(rgb[:, :, c] * m, size) / np.maximum(cov, 1e-6)
    return out, cov > 0.5


def quantize(rgb, alpha, colors):
    """Limit to a small palette (median cut over the opaque pixels), no dithering."""
    ys, xs = np.where(alpha)
    px = np.clip(rgb[ys, xs], 0, 255).astype(np.uint8)[None, :, :]
    q = Image.fromarray(px, 'RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    out = np.zeros((*alpha.shape, 4), np.uint8)
    out[ys, xs, :3] = np.asarray(q)[0]
    out[ys, xs, 3] = 255
    return out


def erode(mask, n):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    for _ in range(n):
        im = im.filter(ImageFilter.MinFilter(3))
    return np.asarray(im) > 127


def magenta(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r - g > 120) & (b - g > 50) & (r > 170)


def sky_blue(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (b - r > 50) & (b - g > 18)


def rotate(a, x0):
    return np.concatenate([a[:, x0:], a[:, :x0]], axis=1)


def seam_blend(a, ov):
    """Make a horizontally tileable image by cross-fading its last `ov` columns into its first ones."""
    w = a.shape[1]
    out = a[:, : w - ov].copy()
    t = (np.arange(ov, dtype=np.float32) / ov)[None, :, None]
    out[:, :ov] = a[:, w - ov :] * (1 - t) + a[:, :ov] * t
    return out


def save(arr, name):
    Image.fromarray(arr, 'RGBA').save(OUT / name, optimize=True)
    return arr.shape[1], arr.shape[0]


# --- far layer: sky + Fuji ---------------------------------------------------------------------

def build_sky():
    a = load('bg-sky.jpg')
    # The sky above the peak is cropped by the screen height, so rebuild it from a cloud-free column strip
    # (rows 0..349 squeezed) so the top still shows the darker upper bands.
    top = a[:349, 450:650]
    top = np.asarray(Image.fromarray(top.astype(np.uint8)).resize((200, 72), Image.BOX)).astype(np.float32)
    top = np.repeat(top, 6, axis=1)[:, : a.shape[1]]
    full = np.concatenate([top, a[349:765]], axis=0)
    scale = 360 / a.shape[1]
    size = (360, round(full.shape[0] * scale))
    rgb, alpha = shrink(full, np.ones(full.shape[:2], bool), size)
    rgb = rgb[:HORIZON]
    alpha = alpha[:HORIZON]
    return quantize(rgb, alpha, 28)


# --- middle layer: town, then pines ------------------------------------------------------------

def build_town():
    a = rotate(load('bg-town.jpg'), 90)[251:544]
    keep = erode(~magenta(a), 2)
    h = 82
    w = round(a.shape[1] * h / a.shape[0])
    rgb, alpha = shrink(a, keep, (w, h))
    return quantize(rgb, alpha, 36)


def build_pines():
    a = rotate(load('bg-pines.jpg'), 120)[291:549]
    y = np.arange(a.shape[0])[:, None]
    white = a.min(axis=2) > 150
    cloud = white & (y < 430 - 291)          # clouds only float in the upper sky; lantern stone is lower
    gone = magenta(a) | sky_blue(a) | cloud
    # grow the removed area so the blue/white fringe pixels around leaves go with it
    gone = ~erode(~gone, 2)
    h = 100
    w = round(a.shape[1] * h / a.shape[0])
    rgb, alpha = shrink(a, ~gone, (w, h))
    # drop specks (isolated sky leftovers)
    im = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))
    alpha = np.asarray(im) > 127
    return quantize(rgb, alpha, 36)


def build_mid():
    town, pines = build_town(), build_pines()
    base = 133
    strip = np.zeros((base + 1, town.shape[1] + pines.shape[1], 4), np.uint8)
    strip[base - town.shape[0] : base, : town.shape[1]] = town
    strip[base - pines.shape[0] + 1 : base + 1, town.shape[1] :] = pines
    need = SCREEN_W + int(STAGE_CAM_MAX * MID_PARALLAX)
    if strip.shape[1] < need:
        raise SystemExit(f'mid strip too short: {strip.shape[1]} < {need}')
    return strip


# --- ground ------------------------------------------------------------------------------------

def build_road():
    a = seam_blend(load('bg-road.jpg'), 40)
    s = 0.14
    size = (round(a.shape[1] * s), round(a.shape[0] * s))
    rgb, alpha = shrink(a, np.ones(a.shape[:2], bool), size)
    rgb, alpha = rgb[: SCREEN_H - HORIZON], alpha[: SCREEN_H - HORIZON]
    return quantize(rgb, alpha, 28)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    layers = {'sky': build_sky(), 'mid': build_mid(), 'road': build_road()}
    info = {}
    for k, arr in layers.items():
        w, h = save(arr, f'bg_{k}.png')
        info[k] = {'image': f'gen/bg_{k}.png', 'w': w, 'h': h}
        print(k, w, h, 'colors', len({tuple(p) for p in arr.reshape(-1, 4) if p[3]}))
    info['sky']['parallax'] = SKY_PARALLAX
    info['mid']['parallax'] = MID_PARALLAX
    info['road']['parallax'] = 1
    info['road']['y'] = HORIZON
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    manifest['_backdrop'] = info
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

    if '--preview' in sys.argv:
        prev = Path(sys.argv[sys.argv.index('--preview') + 1])
        for cam in (0, 512, 1024):
            canvas = Image.new('RGBA', (SCREEN_W, SCREEN_H), (0, 0, 0, 255))
            for k in ('sky', 'mid'):
                im = Image.fromarray(layers[k], 'RGBA')
                canvas.alpha_composite(im, (-int(cam * info[k]['parallax']), 0))
            road = Image.fromarray(layers['road'], 'RGBA')
            for x in range(-(cam % road.width), SCREEN_W, road.width):
                canvas.alpha_composite(road, (x, HORIZON))
            canvas.resize((SCREEN_W * 3, SCREEN_H * 3), Image.NEAREST).save(prev.with_name(f'{prev.stem}_{cam}{prev.suffix}'))


if __name__ == '__main__':
    main()
