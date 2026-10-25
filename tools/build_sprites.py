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

# Each sheet: file, grid (cols, rows), pose names in reading order, and options.
#   ref        pose whose height defines the scale (TARGET_H game pixels)
#   scale_from reuse the scale measured on another sheet
#   main_only  keep only the main figure (drops speed lines, flying objects)
#   erase_rock poses where a gray boulder must be removed
#   flip       poses to mirror horizontally
#   skip       poses that are cut but not used
#   gain       brightness multiplier for a sheet that came out darker than the rest
#   auto_gain  measure the skin tone and brighten/darken the sheet to match the others
#   split      'components' cuts poses by connected shapes instead of empty gaps
#   target_h   height in game pixels for the reference pose (default TARGET_H)
#   center     poses anchored on the middle of their bounding box instead of their feet
#   grow       how far (in 4px steps) components are expanded before grouping; 0 = exact shapes
SHEETS = [
    dict(file="ronin-idle.jpg", grid=(1, 1), names=["idle"], ref="idle"),
    dict(file="sheet-move.jpg", grid=(3, 2), names=["walk1", "walk2", "walk3", "run1", "run2", "jump"], ref="walk2"),
    dict(file="sheet-attack.jpg", grid=(3, 2), names=["windup", "punch", "kick", "flykick", "dash", "upper"], ref="windup"),
    dict(file="sheet-weapon.png", grid=(3, 2), names=["idle_w", "swing1", "swing2", "swing3", "pick", "throwstick"],
         ref="idle_w", main_only=True, skip=["throwstick"]),
    dict(file="sheet-hurt.png", grid=(3, 2), names=["hurt", "lying", "getup", "hold", "throw", "stomp"],
         scale_from="sheet-weapon.png", main_only=True, erase_rock=["hold"], flip=["lying"]),
    dict(file="sheet-grab.png", grid=(3, 2), names=["grab", "lift", "carry1", "carry2", "windswing", "smash"],
         scale_from="sheet-weapon.png", main_only=True),
    dict(file="sheet-special.jpg", grid=(3, 2), names=["charge1", "charge2", "fire1", "fire2", "recover", "cast"],
         ref="recover", main_only=True, gain=1.12),
    dict(file="sheet-blades.jpg", grid=(3, 2), names=["bready", "bwind", "bstrike", "sready", "sstrike", "swind"],
         scale_from="sheet-special.jpg", main_only=True, split="components", grow=0, auto_gain=True),
    dict(file="sheet-heavy.jpg", grid=(3, 2), names=["stcarry", "stwind", "stsmash", "rready", "rfire", "rbash"],
         scale_from="sheet-special.jpg", main_only=True, split="components", grow=0, auto_gain=True),
    dict(file="sheet-air.jpg", grid=(3, 2), names=["jcrouch", "jrise", "jpeak", "jfall", "kb1", "kb2"],
         scale_from="sheet-special.jpg", main_only=True, split="components", grow=0, auto_gain=True,
         center=["kb1", "kb2"]),
    dict(file="ninja-a.jpg", grid=(3, 2), names=["n_idle", "n_walk1", "n_walk2", "n_wind", "n_punch", "n_kick"],
         ref="n_idle", target_h=36, main_only=True, split="components", grow=0),
    dict(file="ninja-b.jpg", grid=(3, 2), names=["n_hurt", "n_fly", "n_lying", "n_getup", "n_rush", "n_kick2"],
         scale_from="ninja-a.jpg", main_only=True, split="components", grow=0, flip=["n_lying"], center=["n_fly"]),
]

# palette: name -> base colour; fringe entries collapse into the outline
PALETTE = [
    ("outline", (6, 4, 12)),
    ("skin", (245, 188, 135)),
    ("skin_shade", (196, 128, 84)),
    ("cloth", (101, 117, 158)),
    ("cloth_dark", (71, 84, 121)),
    ("pants", (120, 86, 55)),
    ("pants_dark", (66, 58, 52)),
    ("sash", (165, 164, 160)),
    ("white", (251, 248, 242)),
    ("sandal", (224, 170, 110)),
    ("sandal_dark", (187, 145, 114)),
    ("wood", (138, 95, 55)),
    ("wood_dark", (98, 65, 36)),
    ("red", (205, 30, 40)),
    ("bamboo", (228, 205, 125)),
    ("bamboo_dark", (168, 138, 72)),
    ("blade", (77, 230, 255)),
    ("blade_dark", (30, 160, 210)),
    ("rock", (128, 128, 134)),
    ("rock_light", (164, 164, 170)),
    ("rock_dark", (88, 88, 96)),
    ("metal", (52, 52, 60)),
    ("metal_light", (100, 100, 112)),
    ("gunwood", (136, 82, 42)),
    ("gunwood_dark", (88, 52, 28)),
    ("nj_body", (34, 41, 63)),
    ("nj_body_dark", (15, 21, 34)),
    ("nj_body_hi", (56, 62, 84)),
    ("nj_red", (196, 20, 21)),
    ("nj_red_dark", (132, 12, 14)),
    ("nj_metal", (119, 122, 126)),
    ("nj_metal_dark", (79, 78, 79)),
    ("fringe7", (108, 31, 88)),
    ("fringe8", (78, 7, 26)),
    ("fringe1", (111, 45, 91)),
    ("fringe2", (48, 20, 39)),
    ("fringe3", (27, 3, 10)),
    ("fringe4", (146, 7, 149)),
    ("fringe5", (78, 2, 82)),
    ("fringe6", (46, 46, 51)),
]
# Weapon colours are only matched inside the poses that actually hold that weapon, so
# similar-looking skin tones never turn into bamboo yellow.
ENTRY_SCOPE = {
    "bamboo": ["bready", "bwind", "bstrike"],
    "bamboo_dark": ["bready", "bwind", "bstrike"],
    "blade": ["sready", "swind", "sstrike"],
    "blade_dark": ["sready", "swind", "sstrike"],
    "rock": ["stcarry", "stwind", "stsmash"],
    "rock_light": ["stcarry", "stwind", "stsmash"],
    "rock_dark": ["stcarry", "stwind", "stsmash"],
    "metal": ["rready", "rfire", "rbash"],
    "metal_light": ["rready", "rfire", "rbash"],
    "gunwood": ["rready", "rfire", "rbash"],
    "gunwood_dark": ["rready", "rfire", "rbash"],
}
NINJA_POSES = ["n_idle", "n_walk1", "n_walk2", "n_wind", "n_punch", "n_kick", "n_hurt", "n_fly", "n_lying", "n_getup", "n_rush", "n_kick2"]
for _n in ("nj_body", "nj_body_dark", "nj_body_hi", "nj_red", "nj_red_dark", "nj_metal", "nj_metal_dark"):
    ENTRY_SCOPE[_n] = NINJA_POSES
# The hero's own colours must not leak into the ninja poses.
NINJA_EXCLUDE = {"cloth", "cloth_dark", "pants", "pants_dark", "sash", "sandal", "sandal_dark", "wood", "wood_dark", "red"}
CANON = {k: "outline" for k in ("fringe1", "fringe2", "fringe3", "fringe4", "fringe5", "fringe6", "fringe7", "fringe8")}
NAMES = [n for n, _ in PALETTE]
PAL = np.array([c for _, c in PALETTE], dtype=np.int32)
CANON_IDX = np.array([NAMES.index(CANON.get(n, n)) for n in NAMES])

RECOLOR = {
    "ichiro": {},
    "jiro": {
        "cloth": (200, 72, 72), "cloth_dark": (142, 46, 56), "sash": (236, 208, 80),
        "pants": (112, 74, 52), "pants_dark": (70, 46, 34),
    },
    "saburo": {
        "cloth": (88, 168, 88), "cloth_dark": (52, 124, 60), "sash": (214, 180, 60),
        "pants": (64, 92, 76), "pants_dark": (38, 62, 50),
    },
}

BASE_FRAMES = [
    "idle", "walk1", "walk2", "walk3", "run1", "run2", "jump",
    "windup", "punch", "kick", "flykick", "dash", "upper",
    "hurt", "lying", "getup", "hold", "throw", "stomp",
    "idle_w", "swing1", "swing2", "swing3", "pick",
    "grab", "lift", "carry1", "carry2", "windswing", "smash",
    "charge1", "charge2", "fire1", "fire2", "recover", "cast",
    "bready", "bwind", "bstrike", "sready", "swind", "sstrike",
    "stcarry", "stwind", "stsmash", "rready", "rfire", "rbash",
    "jcrouch", "jrise", "jpeak", "jfall", "kb1", "kb2",
]
# Armed stances per weapon suffix: the upper body of the "ready" frame is grafted onto
# the legs of each locomotion frame. _w = stick, _w2 = bamboo sword, _w4 = energy sword.
ARMED_BASES = ["walk1", "walk2", "walk3", "run1", "run2", "jump"]
ARMED_SETS = {"_w": "idle_w", "_w2": "bready", "_w3": "stcarry", "_w4": "sready", "_w5": "rready"}
ARMED = [f"{b}{suf}" for suf in ARMED_SETS for b in ARMED_BASES]
FRAME_ORDER = BASE_FRAMES + ARMED

# anim name -> frames (by pose name) and per-frame duration in game ticks
ANIMS = {
    "idle": (["idle"], [60]),
    "walk": (["walk1", "walk2", "walk3", "walk2"], [8, 8, 8, 8]),
    "run": (["run1", "run2"], [4, 4]),
    "jump": (["jrise", "jpeak", "jfall"], [8, 14, 60]),
    "land": (["jcrouch"], [6]),
    "fly": (["kb1", "kb2"], [10, 60]),
    "punch": (["windup", "punch", "punch", "windup"], [2, 4, 3, 3]),
    "kick": (["windup", "kick", "kick", "windup"], [5, 5, 5, 5]),
    "airkick": (["flykick"], [60]),
    "dash": (["dash"], [60]),
    "upper": (["upper"], [60]),
    "hurt": (["hurt"], [60]),
    "down": (["lying"], [60]),
    "dead": (["lying"], [60]),
    "held": (["lying"], [60]),
    "getup": (["getup"], [60]),
    "pick": (["pick"], [60]),
    "swing": (["swing1", "swing2", "swing3"], [5, 4, 13]),
    "throw": (["throw"], [60]),
    "lift": (["grab", "lift", "carry1"], [5, 5, 4]),
    "hold": (["carry1", "carry2"], [12, 12]),
    "holdswing": (["windswing", "smash", "carry1"], [6, 8, 10]),
    "stomp": (["windup", "stomp", "windup"], [4, 8, 8]),
    "beam": (["charge1", "charge2", "fire1", "fire2"], [12, 12, 6, 6]),
    "beamend": (["recover"], [60]),
    "cast": (["cast"], [60]),
    "shoot": (["windup", "punch", "windup"], [2, 6, 2]),
}
LOOPING = {"walk", "run", "hold"}
for _suf, _idle in (("_w", "idle_w"), ("_w2", "bready"), ("_w3", "stcarry"), ("_w4", "sready"), ("_w5", "rready")):
    ANIMS[f"idle{_suf}"] = ([_idle], [60])
    ANIMS[f"walk{_suf}"] = ([f"walk1{_suf}", f"walk2{_suf}", f"walk3{_suf}", f"walk2{_suf}"], [8, 8, 8, 8])
    ANIMS[f"run{_suf}"] = ([f"run1{_suf}", f"run2{_suf}"], [4, 4])
    ANIMS[f"jump{_suf}"] = ([f"jump{_suf}"], [60])
    LOOPING |= {f"walk{_suf}", f"run{_suf}"}
# swing timing matches each weapon's attack in src/shared/weapons.ts (start, active, total)
ANIMS["swing_w2"] = (["bwind", "bstrike", "bstrike"], [4, 4, 10])
ANIMS["swing_w4"] = (["swind", "sstrike", "sstrike"], [3, 5, 8])
ANIMS["swing_w3"] = (["stwind", "stsmash", "stsmash"], [8, 4, 16])
ANIMS["swing_w5"] = (["rbash", "rbash", "rready"], [4, 3, 9])
ANIMS["shoot_w5"] = (["rready", "rfire", "rready"], [2, 6, 2])
LOOP_FROM = {"beam": 2}  # after the last frame, repeat from this frame index


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


def split_components(mask: np.ndarray, grid, names, grow: int = 1):
    """Cut poses by connected shapes (for sheets whose poses overlap in x or y)."""
    mask = drop_specks(mask)
    q = 4
    H, W = mask.shape
    sh, sw = H // q, W // q
    small = mask[: sh * q, : sw * q].reshape(sh, q, sw, q).any(axis=(1, 3))
    grown = small.copy()
    for _ in range(grow):
        g = grown.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                g |= np.roll(np.roll(grown, dy, 0), dx, 1)
        grown = g
    lab, n = label(grown)
    full = np.zeros(mask.shape, np.int32)
    up = np.kron(lab, np.ones((q, q), dtype=np.int32))
    full[: up.shape[0], : up.shape[1]] = up
    cols, rows = grid
    cells = {name: np.zeros_like(mask) for name in names}
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 12:
            continue
        col = min(cols - 1, int(xs.mean() * q / (W / cols)))
        row = min(rows - 1, int(ys.mean() * q / (H / rows)))
        idx = row * cols + col
        if idx < len(names):
            cells[names[idx]] |= mask & (full == k)
    return cells


SKIN_TARGET = np.array([250, 191, 132])


def auto_gain(im: np.ndarray) -> np.ndarray:
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    skin = (r > 150) & (r - b > 60) & (g > 90) & (r > g) & (g > b) & (r - g > 25) & (r - g < 90)
    sel = im[skin]
    top = sel[sel.sum(1) >= np.percentile(sel.sum(1), 50)]
    gain = float(np.clip((SKIN_TARGET / np.median(top, 0)).mean(), 0.85, 1.45))
    print(f"  auto gain {gain:.2f}")
    return np.clip(im * gain, 0, 255).astype(np.int32)


def nearest_palette(rgb: np.ndarray, pose=None) -> np.ndarray:
    allowed = np.array([i for i, n in enumerate(NAMES)
                        if (n not in ENTRY_SCOPE or pose in ENTRY_SCOPE[n]) and not (pose in NINJA_POSES and n in NINJA_EXCLUDE)])
    pal = PAL[allowed]
    out = np.zeros(rgb.shape[:2], np.int32)
    for y0 in range(0, rgb.shape[0], 64):
        blk = rgb[y0:y0 + 64].astype(np.int32)
        d = ((blk[:, :, None, :] - pal[None, None]) ** 2).sum(-1)
        out[y0:y0 + 64] = allowed[d.argmin(-1)]
    return CANON_IDX[out]


def keep_main(mask: np.ndarray) -> np.ndarray:
    """Keep only the largest figure: drops speed lines and thrown objects."""
    q = 4
    H, W = mask.shape
    sh, sw = H // q, W // q
    small = mask[: sh * q, : sw * q].reshape(sh, q, sw, q).any(axis=(1, 3))
    grown = small.copy()
    g = grown.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            g |= np.roll(np.roll(grown, dy, 0), dx, 1)
    grown = g
    lab, n = label(grown)
    areas = np.bincount(lab.ravel(), minlength=n + 1)
    areas[0] = 0
    keep = np.kron(lab == int(areas.argmax()), np.ones((q, q), dtype=bool))
    out = np.zeros_like(mask)
    out[: keep.shape[0], : keep.shape[1]] = mask[: keep.shape[0], : keep.shape[1]] & keep
    return out


def dilate(m: np.ndarray, r: int) -> np.ndarray:
    out = m.copy()
    for d in range(1, r + 1):
        out[:, d:] |= m[:, :-d]
        out[:, :-d] |= m[:, d:]
    m2 = out.copy()
    for d in range(1, r + 1):
        out[d:] |= m2[:-d]
        out[:-d] |= m2[d:]
    return out


def erase_rock(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Remove a gray boulder held overhead, keeping the skin-coloured hands."""
    mx, mn = rgb.max(-1), rgb.min(-1)
    ys, _ = np.nonzero(mask)
    top, height = ys.min(), ys.max() - ys.min()
    band = np.zeros_like(mask)
    band[: top + int(height * 0.30)] = True
    gray = ((mx - mn) < 30) & (mx > 70) & (mx < 215) & mask & band
    skin = (rgb[..., 0] > 190) & (rgb[..., 1] > 120) & (rgb[..., 1] < 215) & (rgb[..., 2] > 70) \
        & (rgb[..., 2] < 170) & ((rgb[..., 0] - rgb[..., 2]) > 50)
    remove = dilate(gray, 9) & ~skin & band
    out = mask & ~remove
    hands = skin & out & band
    if hands.any():
        top_skin = np.nonzero(hands)[0].min()
        above = np.arange(mask.shape[0])[:, None] < top_skin + 2
        out &= ~(above & ~skin)
    return out


def shrink(rgb, mask, scale, flip=False, pose=None, center=False):
    """Return CELL_H x CELL_W index frame (-1 = transparent)."""
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = int(scale * 2)
    sub_rgb = np.pad(rgb[y0:y1, x0:x1], ((pad, pad), (pad, pad), (0, 0)))
    m = np.pad(mask[y0:y1, x0:x1], pad)
    if flip:
        sub_rgb, m = sub_rgb[:, ::-1], m[:, ::-1]
    ys, xs = np.nonzero(m)
    bottom = ys.max() + 1
    band = ys >= bottom - max(4, int((bottom - ys.min()) * FEET_BAND))
    ax = (xs.min() + xs.max() + 1) / 2 if center else (xs[band].min() + xs[band].max() + 1) / 2
    idx = nearest_palette(sub_rgb, pose)
    frame = np.full((CELL_H, CELL_W), -1, np.int32)
    for ty in range(CELL_H):
        sy0 = bottom + (ty - AY) * scale
        a, b = int(np.floor(sy0)), int(np.ceil(sy0 + scale))
        if b <= 0 or a >= m.shape[0]:
            continue
        a, b = max(a, 0), min(b, m.shape[0])
        for tx in range(CELL_W):
            sx0 = ax + (tx - AX) * scale
            c, d = int(np.floor(sx0)), int(np.ceil(sx0 + scale))
            if d <= 0 or c >= m.shape[1]:
                continue
            c, d = max(c, 0), min(d, m.shape[1])
            mb = m[a:b, c:d]
            if mb.size == 0 or mb.mean() < MIN_FILL:
                continue
            counts = np.bincount(idx[a:b, c:d][mb], minlength=len(NAMES))
            frame[ty, tx] = 0 if counts[0] / counts.sum() >= OUTLINE_SHARE else int(counts.argmax())
    return frame


def extend_blade(frame: np.ndarray, names=("bamboo", "bamboo_dark"), add: int = 11) -> np.ndarray:
    """Lengthen a blade that the source image cut off at its edge."""
    idxs = {NAMES.index(n) for n in names}
    _, xs = np.nonzero(frame >= 0)
    xmax = int(xs.max())
    out = frame.copy()
    for y in range(frame.shape[0]):
        hits = [x for x in range(max(0, xmax - 4), xmax + 1) if frame[y, x] in idxs]
        if hits:
            colr = frame[y, max(hits)]
            for x in range(max(hits) + 1, min(CELL_W - 1, max(hits) + 1 + add)):
                out[y, x] = colr
    return out


FIXUPS = {"bstrike": extend_blade}


def tidy(frame: np.ndarray) -> np.ndarray:
    """Remove single stray pixels that have no neighbour."""
    solid = frame >= 0
    pad = np.pad(solid, 1)
    neigh = sum(pad[1 + dy:1 + dy + CELL_H, 1 + dx:1 + dx + CELL_W].astype(int)
                for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    out = frame.copy()
    out[solid & (neigh == 0)] = -1
    return out


def drop_small(frame: np.ndarray, min_area: int = 8) -> np.ndarray:
    """Remove tiny detached specks (impact marks) that are not part of the figure."""
    lab, n = label(frame >= 0)
    if n < 2:
        return frame
    areas = np.bincount(lab.ravel(), minlength=n + 1)
    out = frame.copy()
    for k in range(1, n + 1):
        if areas[k] < min_area:
            out[lab == k] = -1
    return out


def auto_outline(frame: np.ndarray) -> np.ndarray:
    """Close gaps in the outline: any empty pixel touching a coloured one becomes outline."""
    out = frame.copy()
    padded = np.pad(frame, 1, constant_values=-1)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb = padded[1 + dy:1 + dy + CELL_H, 1 + dx:1 + dx + CELL_W]
        out[(frame < 0) & (nb > 0)] = 0
    return out


def build_frames():
    frames, scales = {}, {}
    sash = NAMES.index("sash")
    for sh in SHEETS:
        fname, names = sh["file"], sh["names"]
        im = np.asarray(Image.open(SRC / fname).convert("RGB")).astype(np.int32)
        if sh.get("gain"):
            im = np.clip(im * sh["gain"], 0, 255).astype(np.int32)
        if sh.get("auto_gain"):
            im = auto_gain(im)
        if sh.get("split") == "components":
            poses = split_components(key_background(im), sh["grid"], names, sh.get("grow", 1))
        else:
            poses = split_poses(key_background(im), sh["grid"], names)
        missing = [n for n in names if not poses[n].any()]
        if missing:
            sys.exit(f"{fname}: could not find poses {missing}")
        if "ref" in sh:
            ry, _ = np.nonzero(poses[sh["ref"]])
            scales[fname] = (ry.max() + 1 - ry.min()) / sh.get("target_h", TARGET_H)
            print(f"{fname}: reference '{sh['ref']}' is {ry.max() + 1 - ry.min()}px tall -> scale {scales[fname]:.2f}")
        else:
            scales[fname] = scales[sh["scale_from"]]
            print(f"{fname}: scale {scales[fname]:.2f} (from {sh['scale_from']})")
        for name in names:
            if name in sh.get("skip", []):
                continue
            m = poses[name]
            if name in sh.get("erase_rock", []):
                m = erase_rock(im, m)
            if sh.get("main_only"):
                m = keep_main(m)
            frame = shrink(im, m, scales[fname], name in sh.get("flip", []), name, name in sh.get("center", []))
            if name in FIXUPS:
                frame = FIXUPS[name](frame)
            frames[name] = auto_outline(drop_small(tidy(frame)))
    split = int(np.nonzero((frames["idle_w"] == sash).any(axis=1))[0].max()) + 1
    for suf, upper in ARMED_SETS.items():
        for base in ARMED_BASES:
            out = frames[base].copy()
            out[:split] = frames[upper][:split]
            frames[f"{base}{suf}"] = auto_outline(out)
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


def muzzle_of(frame: np.ndarray):
    """Offset of the barrel tip from the feet anchor (rightmost pixel of the firing pose)."""
    ys, xs = np.nonzero(frame >= 0)
    xmax = int(xs.max())
    rows = ys[xs == xmax]
    return [int(xmax - AX + 1), int(round(float(rows.mean()))) - AY]


# The ninja has its own frames and animations (enemies use far fewer states than the hero).
NINJA_ORDER = ["n_idle", "n_walk1", "n_walk2", "n_wind", "n_punch", "n_kick", "n_hurt", "n_fly", "n_lying", "n_getup", "n_rush", "n_kick2"]
NINJA_ANIMS = {
    "idle": (["n_idle"], [60]),
    "walk": (["n_walk1", "n_idle", "n_walk2", "n_idle"], [9, 6, 9, 6]),
    "run": (["n_rush"], [60]),
    "dash": (["n_rush"], [60]),
    "punch": (["n_wind", "n_punch", "n_punch", "n_wind"], [2, 4, 3, 3]),
    "kick": (["n_wind", "n_kick", "n_wind"], [5, 10, 5]),
    "airkick": (["n_kick2"], [60]),
    "hurt": (["n_hurt"], [60]),
    "fly": (["n_fly"], [60]),
    "down": (["n_lying"], [60]),
    "dead": (["n_lying"], [60]),
    "held": (["n_lying"], [60]),
    "getup": (["n_getup"], [60]),
}

GROUPS = [
    dict(order=FRAME_ORDER, anims=ANIMS, looping=LOOPING, loop_from=LOOP_FROM, chars=RECOLOR, muzzle="rfire"),
    dict(order=NINJA_ORDER, anims=NINJA_ANIMS, looping={"walk"}, loop_from={}, chars={"ninja": {}}, muzzle=None),
]


def write_outputs(frames, preview):
    OUT.mkdir(parents=True, exist_ok=True)
    cols = 7
    manifest = {}
    sheets = {}
    for g in GROUPS:
        order = g["order"]
        rows = (len(order) + cols - 1) // cols
        anims = {}
        for anim, (poses, ticks) in g["anims"].items():
            entry = {"frames": [order.index(p) for p in poses], "ticks": ticks}
            if anim in g["looping"]:
                entry["loop"] = True
            if anim in g["loop_from"]:
                entry["loopFrom"] = g["loop_from"][anim]
            anims[anim] = entry
        for char, overrides in g["chars"].items():
            sheet = np.zeros((rows * CELL_H, cols * CELL_W, 4), np.uint8)
            for i, name in enumerate(order):
                r, c = divmod(i, cols)
                sheet[r * CELL_H:(r + 1) * CELL_H, c * CELL_W:(c + 1) * CELL_W] = colorize(frames[name], overrides)
            Image.fromarray(sheet, "RGBA").save(OUT / f"{char}.png")
            sheets[char] = sheet
            manifest[char] = {"image": f"gen/{char}.png", "w": CELL_W, "h": CELL_H, "ox": AX, "oy": AY, "anims": anims}
            if g["muzzle"]:
                manifest[char]["muzzle"] = muzzle_of(frames[g["muzzle"]])
    mpath = ROOT / "assets" / "manifest.json"
    if mpath.exists():  # keep entries written by build_bg.py / build_enemies.py
        for k, v in json.loads(mpath.read_text()).items():
            manifest.setdefault(k, v)
    mpath.write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote", OUT, "and assets/manifest.json")
    if preview:
        k = 4
        w = cols * CELL_W * k
        order_chars = list(sheets)
        heights = [sheets[c].shape[0] * k for c in order_chars]
        sheet_img = Image.new("RGBA", (w, sum(heights)), (217, 154, 58, 255))
        y = 0
        for c, h in zip(order_chars, heights):
            big = Image.fromarray(sheets[c], "RGBA").resize((sheets[c].shape[1] * k, h), Image.NEAREST)
            sheet_img.alpha_composite(big, (0, y))
            y += h
        sheet_img.convert("RGB").save(preview)
        print("preview", preview)


if __name__ == "__main__":
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    write_outputs(build_frames(), prev)
