#!/usr/bin/env python3
"""Build the upper-rank samurai (bushi) and the general (shogun, boss) sprite sheets.

Unlike the hero pipeline these characters have their own palette, extracted from their own art
(median cut over every pose), and the general uses a bigger cell. The source sheets have black grid
lines between the cells; the lines give the exact cell boundaries.

    python3 tools/build_enemies.py [--preview out.png]

Writes assets/gen/{bushi,shogun}.png and adds both to assets/manifest.json (other entries are kept).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sprites import BG_DIST, label, keep_main, drop_specks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'assets' / 'gen'
MANIFEST = ROOT / 'assets' / 'manifest.json'

OUTLINE_SHARE = 0.38
MIN_FILL = 0.45
FEET_BAND = 0.12
COLS = 7

CHARS = [
    dict(
        id='bushi', cell=(64, 56), anchor=(28, 52), target_h=38, colors=22, ref=('bushi-a.jpg', 'idle'),
        sheets=[
            dict(file='bushi-a.jpg', names=[['idle', 'walk1', 'walk2', 'walk3'], ['wind', 'slash', 'follow']],
                 erase={'slash': (800, 440, 940, 578)}),
            dict(file='bushi-b.jpg', names=[['hurt', 'fly', 'stand2', 'lying'], ['getup', 'rush', 'ready']],
                 flip=['lying'], center=['fly']),
        ],
        anims={
            'idle': (['idle'], [60]),
            'walk': (['walk1', 'idle', 'walk2', 'idle'], [9, 6, 9, 6]),
            'run': (['rush'], [60]),
            'dash': (['rush'], [60]),
            'punch': (['wind', 'slash', 'follow', 'follow'], [3, 3, 4, 2]),
            'kick': (['ready', 'wind', 'slash', 'follow'], [5, 4, 5, 6]),
            'hurt': (['hurt'], [60]),
            'fly': (['fly'], [60]),
            'down': (['lying'], [60]),
            'dead': (['lying'], [60]),
            'held': (['lying'], [60]),
            'getup': (['getup'], [60]),
        },
        looping={'walk'},
    ),
    dict(
        id='shogun', cell=(88, 72), anchor=(40, 68), target_h=50, colors=26, ref=('shogun-a.jpg', 'idle'),
        sheets=[
            dict(file='shogun-a.jpg', names=[['idle', 'walk1', 'walk2'], ['wind', 'slam', 'follow']],
                 erase_bright={'slam': (740, 640, 938, 768)}),
            dict(file='shogun-b.jpg', names=[['hurt', 'fly', 'lying'], ['getup', 'rush', 'roar']],
                 flip=['lying'], center=['fly'], erase_bright={'roar': (1215, 385, 1376, 540)}, trim_bottom=28),
        ],
        anims={
            'idle': (['idle'], [60]),
            'walk': (['walk1', 'idle', 'walk2', 'idle'], [10, 6, 10, 6]),
            'run': (['rush'], [60]),
            'dash': (['rush'], [60]),
            'punch': (['wind', 'slam', 'follow', 'follow'], [4, 4, 4, 2]),
            'kick': (['roar', 'wind', 'slam', 'follow'], [5, 4, 5, 6]),
            'hurt': (['hurt'], [60]),
            'fly': (['fly'], [60]),
            'down': (['lying'], [60]),
            'dead': (['lying'], [60]),
            'held': (['lying'], [60]),
            'getup': (['getup'], [60]),
        },
        looping={'walk'},
    ),
]


def key_bg(im):
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3),
                             im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    return np.sqrt(((im - bg) ** 2).sum(-1)) > BG_DIST


def grid_cells(im):
    """Cell boxes (x0, x1, y0, y1) per row, from the black separator lines."""
    H, W, _ = im.shape
    dark = im.max(2) < 70
    hrows = np.nonzero(dark.mean(1) > 0.9)[0]
    bounds = [0]
    if hrows.size:
        bounds += [int(hrows.min()), int(hrows.max()) + 1]
    bounds.append(H)
    bands = [(bounds[i], bounds[i + 1]) for i in range(0, len(bounds), 2) if bounds[i + 1] - bounds[i] > 20]
    rows = []
    for y0, y1 in bands:
        cols = np.nonzero(dark[y0:y1].mean(0) > 0.9)[0]
        groups = []
        for c in cols:
            if groups and c - groups[-1][1] <= 3:
                groups[-1][1] = int(c)
            else:
                groups.append([int(c), int(c)])
        cells, x = [], 0
        for g0, g1 in groups:
            cells.append((x, g0))
            x = g1 + 1
        cells.append((x, W))
        rows.append([(a + 2, b - 2, y0 + 2, y1 - 2) for a, b in cells])
    return rows


def erode(m, n):
    for _ in range(n):
        p = np.pad(m, 1)
        m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def auto_outline(frame):
    out = frame.copy()
    p = np.pad(frame, 1, constant_values=-1)
    h, w = frame.shape
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb = p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
        out[(frame < 0) & (nb > 0)] = 0
    return out


def tidy(frame):
    solid = frame >= 0
    p = np.pad(solid, 1)
    h, w = frame.shape
    n = sum(p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w].astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    out = frame.copy()
    out[solid & (n == 0)] = -1
    return out


def drop_small(frame, min_area=8):
    lab, n = label(frame >= 0)
    if n < 2:
        return frame
    areas = np.bincount(lab.ravel(), minlength=n + 1)
    out = frame.copy()
    for k in range(1, n + 1):
        if areas[k] < min_area:
            out[lab == k] = -1
    return out


def cut_poses(char):
    """-> {pose: (rgb, mask)} with the figure only (grid lines, captions and effects removed)."""
    poses = {}
    for sh in char['sheets']:
        im = np.asarray(Image.open(SRC / sh['file']).convert('RGB')).astype(np.int32)
        fg = key_bg(im)
        rows = grid_cells(im)
        for names, cells in zip(sh['names'], rows):
            if len(names) != len(cells):
                sys.exit(f"{sh['file']}: expected {len(names)} cells in a row, found {len(cells)}")
            for name, (x0, x1, y0, y1) in zip(names, cells):
                y1 -= sh.get('trim_bottom', 0)      # caption text under the poses
                m = np.zeros_like(fg)
                m[y0:y1, x0:x1] = fg[y0:y1, x0:x1]
                if name in sh.get('erase', {}):      # effect that touches the figure (slash arc)
                    ex0, ey0, ex1, ey1 = sh['erase'][name]
                    m[ey0:ey1, ex0:ex1] = False
                if name in sh.get('erase_bright', {}):   # flames / impact stars (bright yellow) inside a box
                    ex0, ey0, ex1, ey1 = sh['erase_bright'][name]
                    r, g, b = im[..., 0], im[..., 1], im[..., 2]
                    bright = (r > 225) & (g > 125) & (b < 160)
                    box = np.zeros_like(m)
                    box[ey0:ey1, ex0:ex1] = True
                    m &= ~(bright & box)
                m = drop_specks(m)
                m = keep_main(m)
                m = erode(m, 2)   # JPEG / background-blend fringe
                if not m.any():
                    sys.exit(f"{sh['file']}: pose '{name}' is empty")
                poses[name] = (im, m, sh)
    return poses


def nearest(rgb, pal):
    out = np.zeros(rgb.shape[:2], np.int32)
    for y0 in range(0, rgb.shape[0], 64):
        blk = rgb[y0:y0 + 64].astype(np.int32)
        d = ((blk[:, :, None, :] - pal[None, None]) ** 2).sum(-1)
        out[y0:y0 + 64] = d.argmin(-1)
    return out


def extract_palette(poses, colors):
    px = np.concatenate([im[m] for im, m, _ in poses.values()])
    if len(px) > 400000:
        px = px[np.random.default_rng(1).choice(len(px), 400000, replace=False)]
    q = Image.fromarray(px.astype(np.uint8)[None], 'RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = np.array(q.getpalette()[: colors * 3]).reshape(-1, 3)
    used = np.unique(np.asarray(q))
    pal = pal[used]
    pal = pal[np.argsort(pal.sum(1))]      # darkest (outline) first
    return pal.astype(np.int32)


def shrink(rgb, mask, scale, pal, cell, anchor, flip=False, center=False):
    cw, ch = cell
    ax0, ay0 = anchor
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = int(scale * 2)
    sub = np.pad(rgb[y0:y1, x0:x1], ((pad, pad), (pad, pad), (0, 0)))
    m = np.pad(mask[y0:y1, x0:x1], pad)
    if flip:
        sub, m = sub[:, ::-1], m[:, ::-1]
    ys, xs = np.nonzero(m)
    bottom = ys.max() + 1
    band = ys >= bottom - max(4, int((bottom - ys.min()) * FEET_BAND))
    ax = (xs.min() + xs.max() + 1) / 2 if center else (xs[band].min() + xs[band].max() + 1) / 2
    idx = nearest(sub, pal)
    frame = np.full((ch, cw), -1, np.int32)
    for ty in range(ch):
        sy0 = bottom + (ty - ay0) * scale
        a, b = int(np.floor(sy0)), int(np.ceil(sy0 + scale))
        if b <= 0 or a >= m.shape[0]:
            continue
        a, b = max(a, 0), min(b, m.shape[0])
        for tx in range(cw):
            sx0 = ax + (tx - ax0) * scale
            c, d = int(np.floor(sx0)), int(np.ceil(sx0 + scale))
            if d <= 0 or c >= m.shape[1]:
                continue
            c, d = max(c, 0), min(d, m.shape[1])
            mb = m[a:b, c:d]
            if mb.size == 0 or mb.mean() < MIN_FILL:
                continue
            counts = np.bincount(idx[a:b, c:d][mb], minlength=len(pal))
            frame[ty, tx] = 0 if counts[0] / counts.sum() >= OUTLINE_SHARE else int(counts.argmax())
    return frame


def build_char(char):
    poses = cut_poses(char)
    ref_file, ref_pose = char['ref']
    _, rm, _ = poses[ref_pose]
    ry, _ = np.nonzero(rm)
    scale = (ry.max() + 1 - ry.min()) / char['target_h']
    print(f"{char['id']}: reference '{ref_pose}' {ry.max() + 1 - ry.min()}px -> scale {scale:.2f}")
    pal = extract_palette(poses, char['colors'])
    print('  palette', len(pal), 'colours')
    frames = {}
    for name, (im, m, sh) in poses.items():
        f = shrink(im, m, scale, pal, char['cell'], char['anchor'], name in sh.get('flip', []), name in sh.get('center', []))
        frames[name] = auto_outline(drop_small(tidy(f)))
        ys, xs = np.nonzero(frames[name] >= 0)
        print(f"  {name:8s} h={ys.max() - ys.min() + 1:2d} x={xs.min() - char['anchor'][0]:+d}..{xs.max() - char['anchor'][0]:+d}")
    return frames, pal


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    previews = []
    for char in CHARS:
        frames, pal = build_char(char)
        order = []
        for _, (poses, _) in char['anims'].items():
            for p in poses:
                if p not in order:
                    order.append(p)
        cw, ch = char['cell']
        rows = (len(order) + COLS - 1) // COLS
        sheet = np.zeros((rows * ch, COLS * cw, 4), np.uint8)
        for i, name in enumerate(order):
            r, c = divmod(i, COLS)
            f = frames[name]
            tile = np.zeros((ch, cw, 4), np.uint8)
            solid = f >= 0
            tile[solid, :3] = pal[f[solid]]
            tile[solid, 3] = 255
            sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = tile
        Image.fromarray(sheet, 'RGBA').save(OUT / f"{char['id']}.png", optimize=True)
        anims = {}
        for a, (poses, ticks) in char['anims'].items():
            e = {'frames': [order.index(p) for p in poses], 'ticks': ticks}
            if a in char['looping']:
                e['loop'] = True
            anims[a] = e
        manifest[char['id']] = {'image': f"gen/{char['id']}.png", 'w': cw, 'h': ch, 'ox': char['anchor'][0], 'oy': char['anchor'][1], 'anims': anims}
        previews.append(sheet)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print('wrote', OUT, 'and assets/manifest.json')
    if '--preview' in sys.argv:
        k = 4
        W = max(p.shape[1] for p in previews) * k
        H = sum(p.shape[0] for p in previews) * k
        img = Image.new('RGBA', (W, H), (217, 154, 58, 255))
        y = 0
        for p in previews:
            big = Image.fromarray(p, 'RGBA').resize((p.shape[1] * k, p.shape[0] * k), Image.NEAREST)
            img.alpha_composite(big, (0, y))
            y += big.height
        img.convert('RGB').save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
