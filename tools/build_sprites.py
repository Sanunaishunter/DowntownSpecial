#!/usr/bin/env python3
"""Turn AI-generated sprite sheets in art-src/ into game-ready sprite sheets.

Pipeline: key out the flat background -> split each sheet into poses ->
normalise scale and align feet -> snap to a fixed palette and shrink with a
majority vote (keeps outlines crisp) -> write one recoloured sheet per
character plus assets/manifest.json.

Usage: python3 tools/build_sprites.py [--preview out.png]
Needs: pip install pillow numpy
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
OUT = ROOT / "assets" / "gen"

TARGET_H = 38  # height of an upright pose in game pixels
CELL_W, CELL_H = 64, 56
AX, AY = 28, 52  # anchor (feet centre / ground line) inside a cell
BG_DIST = 70
OUTLINE_SHARE = 0.38
MIN_FILL = 0.45
FEET_BAND = 0.12

# (file, grid cols x rows, pose names, pose used to normalise scale)
SHEETS = [
    ("ronin-idle.jpg", (1, 1), ["idle"], "idle"),
    ("sheet-move.jpg", (3, 2), ["walk1", "walk2", "walk3", "run1", "run2", "jump"], "walk2"),
    ("sheet-attack.jpg", (3, 2), ["windup", "punch", "kick", "flykick", "dash", "upper"], "windup"),
]

# palette: name -> (base colour, canonical index it collapses into)
PALETTE = [
    ("outline", (6, 4, 12)),
    ("skin", (240, 180, 133)),
    ("skin_shade", (186, 126, 89)),
    ("cloth", (100, 107, 145)),
    ("cloth_dark", (72, 77, 108)),
    ("pants", (121, 94, 67)),
    ("pants_dark", (74, 58, 49)),
    ("sash", (165, 164, 160)),
    ("white", (251, 248, 242)),
    ("sandal", (224, 182, 152)),
    ("sandal_dark", (187, 145, 114)),
    ("fringe1", (111, 45, 91)),
    ("fringe2", (48, 20, 39)),
    ("fringe3", (27, 3, 10)),
]
CANON = {"fringe1": "outline", "fringe2": "outline", "fringe3": "outline"}
NAMES = [n for n, _ in PALETTE]
PAL = np.array([c for _, c in PALETTE], dtype=np.int32)
CANON_IDX = np.array([NAMES.index(CANON.get(n, n)) for n in NAMES])

RECOLOR = {
    "kunimasa": {},
    "rikigoro": {
        "cloth": (200, 72, 72), "cloth_dark": (142, 46, 56), "sash": (236, 208, 80),
        "pants": (72, 72, 96), "pants_dark": (46, 46, 64),
    },
    "zako": {
        "cloth": (88, 168, 88), "cloth_dark": (52, 124, 60), "sash": (214, 180, 60),
        "pants": (64, 92, 76), "pants_dark": (38, 62, 50),
    },
    "ginpa": {
        "cloth": (160, 92, 208), "cloth_dark": (108, 58, 162), "sash": (244, 212, 70),
        "pants": (84, 58, 124), "pants_dark": (52, 36, 80),
    },
}

FRAME_ORDER = [
    "idle", "walk1", "walk2", "walk3", "run1", "run2", "jump",
    "windup", "punch", "kick", "flykick", "dash", "upper", "lying",
]

# anim name -> frames (by pose name) and per-frame duration in game ticks
ANIMS = {
    "idle": (["idle"], [60]),
    "walk": (["walk1", "walk2", "walk3", "walk2"], [8, 8, 8, 8]),
    "run": (["run1", "run2"], [4, 4]),
    "jump": (["jump"], [60]),
    "punch": (["windup", "punch", "punch", "windup"], [2, 4, 3, 3]),
    "kick": (["windup", "kick", "kick", "windup"], [5, 5, 5, 5]),
    "airkick": (["flykick"], [60]),
    "dash": (["dash"], [60]),
    "upper": (["upper"], [60]),
    "hurt": (["idle"], [60]),
    "down": (["lying"], [60]),
    "dead": (["lying"], [60]),
    "held": (["lying"], [60]),
    "getup": (["idle"], [60]),
    "pick": (["idle"], [60]),
    "swing": (["windup", "punch", "punch", "windup"], [5, 4, 4, 9]),
    "throw": (["punch"], [60]),
    "lift": (["idle"], [60]),
    "hold": (["idle"], [60]),
    "holdswing": (["idle"], [60]),
    "stomp": (["windup", "kick", "kick", "windup"], [4, 4, 4, 8]),
}
LOOPING = {"walk", "run"}


def key_background(im: np.ndarray) -> np.ndarray:
    border = np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3),
                             im[:, :8].reshape(-1, 3), im[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    return np.sqrt(((im - bg) ** 2).sum(-1)) > BG_DIST


def label(mask: np.ndarray):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]:
            continue
        n += 1
        lab[y, x] = n
        stack = [(y, x)]
        while stack:
            cy, cx = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
    return lab, n


def drop_specks(mask: np.ndarray) -> np.ndarray:
    """Remove tiny disconnected specks (JPEG noise) from the mask."""
    q = 4
    H, W = mask.shape
    sh, sw = H // q, W // q
    small = mask[: sh * q, : sw * q].reshape(sh, q, sw, q).any(axis=(1, 3))
    lab, n = label(small)
    keep = np.zeros(n + 1, bool)
    areas = np.bincount(lab.ravel(), minlength=n + 1)
    keep[1:] = areas[1:] >= 12
    keep_full = np.kron(keep[lab], np.ones((q, q), dtype=bool))
    out = np.zeros_like(mask)
    out[: keep_full.shape[0], : keep_full.shape[1]] = mask[: keep_full.shape[0], : keep_full.shape[1]] & keep_full
    return out


def find_cuts(profile: np.ndarray, parts: int) -> list:
    """Cut positions (len parts-1) through the empty gaps nearest to an even split."""
    size = len(profile)
    empty = profile == 0
    runs, i = [], 0
    while i < size:
        if empty[i]:
            j = i
            while j < size and empty[j]:
                j += 1
            if j - i >= 3 and i > 0 and j < size:
                runs.append((i + j) // 2)
            i = j
        else:
            i += 1
    cuts = []
    for k in range(1, parts):
        target = k * size / parts
        if not runs:
            cuts.append(int(target))
        else:
            cuts.append(min(runs, key=lambda r: abs(r - target)))
    return cuts


def split_poses(mask: np.ndarray, grid, names):
    """Return {name: boolean mask of that pose}, cutting the sheet along empty gaps."""
    mask = drop_specks(mask)
    cols, rows = grid
    H, W = mask.shape
    ycuts = [0] + find_cuts(mask.sum(axis=1), rows) + [H]
    cell_masks = {}
    for r in range(rows):
        band = mask[ycuts[r]:ycuts[r + 1]]
        xcuts = [0] + find_cuts(band.sum(axis=0), cols) + [W]
        for c in range(cols):
            idx = r * cols + c
            if idx >= len(names):
                continue
            m = np.zeros_like(mask)
            m[ycuts[r]:ycuts[r + 1], xcuts[c]:xcuts[c + 1]] = band[:, xcuts[c]:xcuts[c + 1]]
            cell_masks[names[idx]] = m
    return cell_masks


def nearest_palette(rgb: np.ndarray) -> np.ndarray:
    out = np.zeros(rgb.shape[:2], np.int32)
    for y0 in range(0, rgb.shape[0], 64):
        blk = rgb[y0:y0 + 64].astype(np.int32)
        d = ((blk[:, :, None, :] - PAL[None, None]) ** 2).sum(-1)
        out[y0:y0 + 64] = d.argmin(-1)
    return CANON_IDX[out]


def shrink(rgb, mask, scale):
    """Return CELL_H x CELL_W index frame (-1 = transparent)."""
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    band = ys >= y1 - max(4, int((y1 - y0) * FEET_BAND))
    ax = (xs[band].min() + xs[band].max() + 1) / 2
    pad = int(scale * 2)
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    cx1, cy1 = min(mask.shape[1], x1 + pad), min(mask.shape[0], y1 + pad)
    idx = nearest_palette(rgb[cy0:cy1, cx0:cx1])
    m = mask[cy0:cy1, cx0:cx1]
    frame = np.full((CELL_H, CELL_W), -1, np.int32)
    for ty in range(CELL_H):
        sy0 = y1 + (ty - AY) * scale - cy0
        sy1 = sy0 + scale
        a, b = int(np.floor(sy0)), int(np.ceil(sy1))
        if b <= 0 or a >= m.shape[0]:
            continue
        a, b = max(a, 0), min(b, m.shape[0])
        for tx in range(CELL_W):
            sx0 = ax + (tx - AX) * scale - cx0
            sx1 = sx0 + scale
            c, d = int(np.floor(sx0)), int(np.ceil(sx1))
            if d <= 0 or c >= m.shape[1]:
                continue
            c, d = max(c, 0), min(d, m.shape[1])
            mb = m[a:b, c:d]
            if mb.size == 0 or mb.mean() < MIN_FILL:
                continue
            counts = np.bincount(idx[a:b, c:d][mb], minlength=len(NAMES))
            tot = counts.sum()
            frame[ty, tx] = 0 if counts[0] / tot >= OUTLINE_SHARE else int(counts.argmax())
    return frame


def tidy(frame: np.ndarray) -> np.ndarray:
    """Remove single stray pixels that have no neighbour."""
    solid = frame >= 0
    pad = np.pad(solid, 1)
    neigh = sum(pad[1 + dy:1 + dy + CELL_H, 1 + dx:1 + dx + CELL_W].astype(int)
                for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    out = frame.copy()
    out[solid & (neigh == 0)] = -1
    return out


def lying_from(idle: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(idle >= 0)
    crop = idle[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    rot = np.rot90(crop, 1)
    out = np.full_like(idle, -1)
    h, w = rot.shape
    x0 = AX - w // 2
    y0 = AY - h
    out[y0:y0 + h, x0:x0 + w] = rot
    return out


def build_frames():
    frames = {}
    for fname, grid, names, ref in SHEETS:
        im = np.asarray(Image.open(SRC / fname).convert("RGB")).astype(np.int32)
        mask = key_background(im)
        poses = split_poses(mask, grid, names)
        missing = [n for n in names if not poses[n].any()]
        if missing:
            sys.exit(f"{fname}: could not find poses {missing}")
        ry, _ = np.nonzero(poses[ref])
        scale = (ry.max() + 1 - ry.min()) / TARGET_H
        print(f"{fname}: reference '{ref}' is {ry.max() + 1 - ry.min()}px tall -> scale {scale:.2f}")
        for name in names:
            frames[name] = tidy(shrink(im, poses[name], scale))
    frames["lying"] = lying_from(frames["idle"])
    return frames


def colorize(frame: np.ndarray, overrides) -> np.ndarray:
    pal = {n: c for n, c in PALETTE}
    pal.update(overrides)
    lut = np.array([pal[CANON.get(n, n)] if n in CANON else pal[n] for n in NAMES], dtype=np.uint8)
    out = np.zeros((*frame.shape, 4), np.uint8)
    solid = frame >= 0
    out[solid, :3] = lut[frame[solid]]
    out[solid, 3] = 255
    return out


def write_outputs(frames, preview):
    OUT.mkdir(parents=True, exist_ok=True)
    cols = 7
    rows = (len(FRAME_ORDER) + cols - 1) // cols
    manifest = {}
    anims = {}
    for anim, (poses, ticks) in ANIMS.items():
        entry = {"frames": [FRAME_ORDER.index(p) for p in poses], "ticks": ticks}
        if anim in LOOPING:
            entry["loop"] = True
        anims[anim] = entry
    sheets = {}
    for char, overrides in RECOLOR.items():
        sheet = np.zeros((rows * CELL_H, cols * CELL_W, 4), np.uint8)
        for i, name in enumerate(FRAME_ORDER):
            r, c = divmod(i, cols)
            sheet[r * CELL_H:(r + 1) * CELL_H, c * CELL_W:(c + 1) * CELL_W] = colorize(frames[name], overrides)
        Image.fromarray(sheet, "RGBA").save(OUT / f"{char}.png")
        sheets[char] = sheet
        manifest[char] = {"image": f"gen/{char}.png", "w": CELL_W, "h": CELL_H, "ox": AX, "oy": AY, "anims": anims}
    (ROOT / "assets" / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote", OUT, "and assets/manifest.json")
    if preview:
        k = 4
        w = cols * CELL_W * k
        sheet_img = Image.new("RGBA", (w, rows * CELL_H * k * len(RECOLOR)), (217, 154, 58, 255))
        for n, char in enumerate(RECOLOR):
            big = Image.fromarray(sheets[char], "RGBA").resize((cols * CELL_W * k, rows * CELL_H * k), Image.NEAREST)
            sheet_img.alpha_composite(big, (0, n * rows * CELL_H * k))
        sheet_img.convert("RGB").save(preview)
        print("preview", preview)


if __name__ == "__main__":
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    write_outputs(build_frames(), prev)
