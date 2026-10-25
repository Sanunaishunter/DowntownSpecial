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
    ("fringe1", (111, 45, 91)),
    ("fringe2", (48, 20, 39)),
    ("fringe3", (27, 3, 10)),
    ("fringe4", (146, 7, 149)),
    ("fringe5", (78, 2, 82)),
    ("fringe6", (46, 46, 51)),
]
CANON = {k: "outline" for k in ("fringe1", "fringe2", "fringe3", "fringe4", "fringe5", "fringe6")}
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
    "shiro": {
        "cloth": (160, 92, 208), "cloth_dark": (108, 58, 162), "sash": (244, 212, 70),
        "pants": (84, 58, 124), "pants_dark": (52, 36, 80),
    },
}

BASE_FRAMES = [
    "idle", "walk1", "walk2", "walk3", "run1", "run2", "jump",
    "windup", "punch", "kick", "flykick", "dash", "upper",
    "hurt", "lying", "getup", "hold", "throw", "stomp",
    "idle_w", "swing1", "swing2", "swing3", "pick",
    "grab", "lift", "carry1", "carry2", "windswing", "smash",
    "charge1", "charge2", "fire1", "fire2", "recover", "cast",
]
# lower body from these frames is grafted under the upper body of idle_w (armed stance)
ARMED = {"walk1_w": "walk1", "walk2_w": "walk2", "walk3_w": "walk3",
         "run1_w": "run1", "run2_w": "run2", "jump_w": "jump"}
FRAME_ORDER = BASE_FRAMES + list(ARMED)

# anim name -> frames (by pose name) and per-frame duration in game ticks
ANIMS = {
    "idle": (["idle"], [60]),
    "walk": (["walk1", "walk2", "walk3", "walk2"], [8, 8, 8, 8]),
    "run": (["run1", "run2"], [4, 4]),
    "jump": (["jump"], [60]),
    "idle_w": (["idle_w"], [60]),
    "walk_w": (["walk1_w", "walk2_w", "walk3_w", "walk2_w"], [8, 8, 8, 8]),
    "run_w": (["run1_w", "run2_w"], [4, 4]),
    "jump_w": (["jump_w"], [60]),
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
LOOPING = {"walk", "run", "walk_w", "run_w", "hold"}
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


def nearest_palette(rgb: np.ndarray) -> np.ndarray:
    out = np.zeros(rgb.shape[:2], np.int32)
    for y0 in range(0, rgb.shape[0], 64):
        blk = rgb[y0:y0 + 64].astype(np.int32)
        d = ((blk[:, :, None, :] - PAL[None, None]) ** 2).sum(-1)
        out[y0:y0 + 64] = d.argmin(-1)
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


def shrink(rgb, mask, scale, flip=False):
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
    ax = (xs[band].min() + xs[band].max() + 1) / 2
    idx = nearest_palette(sub_rgb)
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
        poses = split_poses(key_background(im), sh["grid"], names)
        missing = [n for n in names if not poses[n].any()]
        if missing:
            sys.exit(f"{fname}: could not find poses {missing}")
        if "ref" in sh:
            ry, _ = np.nonzero(poses[sh["ref"]])
            scales[fname] = (ry.max() + 1 - ry.min()) / TARGET_H
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
            frames[name] = auto_outline(drop_small(tidy(shrink(im, m, scales[fname], name in sh.get("flip", [])))))
    split = int(np.nonzero((frames["idle_w"] == sash).any(axis=1))[0].max()) + 1
    for armed, base in ARMED.items():
        out = frames[base].copy()
        out[:split] = frames["idle_w"][:split]
        frames[armed] = auto_outline(out)
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
        if anim in LOOP_FROM:
            entry["loopFrom"] = LOOP_FROM[anim]
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
