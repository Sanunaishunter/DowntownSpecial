import { St } from '../shared/types';

export const SPR_W = 40;
export const SPR_H = 40;
export const ANCHOR_X = 20;
export const ANCHOR_Y = 36;

type Grid = string[][];

const PALETTES: Record<string, Record<string, string>> = {
  ichiro: {
    H: '#202028', h: '#505068', S: '#f8c898', s: '#d09060', C: '#f8f8f0', c: '#b8c0d8', L: '#8090c0',
    B: '#2848b0', b: '#182c78', T: '#3858c8', t: '#24409a', F: '#6a4428', f: '#3e2614',
    E: '#101018', M: '#a03030', K: '#c88840', k: '#80501c', O: '#101018',
  },
  jiro: {
    H: '#202028', h: '#505068', S: '#f0b888', s: '#c88050', C: '#e04848', c: '#a02828', L: '#f8d0c0',
    B: '#f0d040', b: '#b08820', T: '#484860', t: '#2c2c40', F: '#6a4428', f: '#3e2614',
    E: '#101018', M: '#a03030', K: '#c88840', k: '#80501c', O: '#101018',
  },
  saburo: {
    H: '#181820', h: '#40405a', S: '#f0c090', s: '#c88c58', C: '#58a858', c: '#347c3c', L: '#c8f0c0',
    B: '#d0b038', b: '#8c7418', T: '#3c5848', t: '#243c30', F: '#5a3a20', f: '#34200c',
    E: '#101018', M: '#a03030', K: '#c88840', k: '#80501c', O: '#101018',
  },
  shogun: {
    H: '#d8d8e0', h: '#ffffff', S: '#e8b890', s: '#b88058', C: '#9c58cc', c: '#6a38a0', L: '#e0c0f8',
    B: '#f0d040', b: '#b08820', T: '#503878', t: '#32224e', F: '#5a3a20', f: '#34200c',
    E: '#101018', M: '#a03030', K: '#c88840', k: '#80501c', O: '#101018',
  },
};

const HEAD = [
  '....hHH...',
  '..HHHHHHH.',
  '.HHhHHHHHH',
  '.HHHHHHHHH',
  '.HHHSSSSSS',
  '.HHSSSHHHS',
  '.HHSSSSESS',
  '.HsSSSSESs',
  '..SSSSSSSs',
  '..SSSSMMSS',
  '...sSSSSs.',
];
const swapRow = (rows: string[], edits: Record<number, string>) => rows.map((r, i) => edits[i] ?? r);
const HEAD_SHOUT = swapRow(HEAD, { 9: '..SSSMMMMS', 10: '...sSMMSs.' });
const HEAD_HURT = swapRow(HEAD, { 5: '.HHSSSSSSS', 6: '.HHSSSSSSS', 7: '.HsSSSEEEs', 9: '..SSSMMMMS', 10: '...sSMMSs.' });
const HEADS: Record<string, string[]> = { n: HEAD, s: HEAD_SHOUT, h: HEAD_HURT };

const TORSO = [
  '.CCCCCCCCCC.',
  'CCCCCCCLCCCc',
  'CCCCCCCCLCCc',
  'CCCCCCCCCLCc',
  'CCCcCCCCCCCc',
  'CCCCCCCCCCcc',
  'BBBBBBBBBBBB',
  'BbBBBBBbBBBb',
];

function newGrid(): Grid {
  return Array.from({ length: SPR_H }, () => Array<string>(SPR_W).fill('.'));
}

function set(g: Grid, x: number, y: number, ch: string) {
  if (x >= 0 && y >= 0 && x < SPR_W && y < SPR_H) g[y][x] = ch;
}

function put(g: Grid, part: string[], x: number, y: number, edge = false) {
  const h = part.length;
  const w = part[0].length;
  const at = (px: number, py: number) => (px >= 0 && py >= 0 && px < w && py < h ? part[py][px] : '.');
  if (edge) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (part[j][i] !== '.')
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (at(i + dx, j + dy) === '.') set(g, x + i + dx, y + j + dy, 'O');
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (part[j][i] !== '.') set(g, x + i, y + j, part[j][i]);
}

function rect(g: Grid, x: number, y: number, w: number, h: number, main: string, shade = main, edge = false) {
  const part: string[] = [];
  for (let j = 0; j < h; j++) {
    let row = '';
    for (let i = 0; i < w; i++) row += i === w - 1 || j === h - 1 ? shade : main;
    part.push(row);
  }
  put(g, part, x, y, edge);
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    set(g, x + 1, y, 'k');
    set(g, x, y + 1, 'k');
    set(g, x, y, 'K');
  }
}

function stickVertical(g: Grid, hx: number, hy: number) {
  line(g, hx, hy, hx + 1, hy - 18);
}

// ---- limbs ----
function legStand(g: Grid, x: number, y: number, edge = false) {
  rect(g, x, y, 5, 6, 'T', 't', edge);
  rect(g, x + 1, y + 6, 3, 2, 'S', 's');
  rect(g, x, y + 8, 6, 2, 'F', 'f');
}

function legTuck(g: Grid, x: number, y: number, edge = false) {
  rect(g, x, y, 7, 4, 'T', 't', edge);
  rect(g, x + 3, y + 4, 4, 3, 'T', 't');
  rect(g, x + 4, y + 7, 3, 2, 'S', 's');
  rect(g, x + 3, y + 9, 6, 2, 'F', 'f');
}

function legKick(g: Grid, x: number, y: number, len: number) {
  rect(g, x, y, len, 4, 'T', 't', true);
  rect(g, x + len - 5, y + 1, 3, 2, 'S', 's');
  rect(g, x + len - 2, y - 1, 3, 6, 'F', 'f', true);
}

function armDown(g: Grid, x: number, y: number, edge = false) {
  rect(g, x, y, 3, 6, 'C', 'c', edge);
  rect(g, x, y + 6, 3, 3, 'S', 's');
}

function armFwd(g: Grid, x: number, y: number, len: number) {
  rect(g, x, y, len, 3, 'C', 'c', true);
  rect(g, x + len, y - 1, 4, 4, 'S', 's', true);
}

function armUp(g: Grid, x: number, y: number, len: number, edge = true) {
  rect(g, x, y, 3, len, 'C', 'c', edge);
  rect(g, x, y - 3, 3, 3, 'S', 's', edge);
}

function armBent(g: Grid, x: number, y: number) {
  rect(g, x, y, 5, 3, 'C', 'c', true);
  rect(g, x + 4, y - 3, 3, 3, 'S', 's', true);
}

interface Ctx {
  g: Grid;
  tx: number;
  ty: number;
  hx: number;
  hy: number;
  face: string;
}

function body(c: Ctx) {
  put(c.g, TORSO, c.tx, c.ty);
  put(c.g, HEADS[c.face], c.hx, c.hy, true);
}

function lyingFrom(g: Grid): Grid {
  const n = Math.max(SPR_W, SPR_H);
  const r = newGrid();
  let minY = SPR_H;
  let maxY = 0;
  let minX = SPR_W;
  let maxX = 0;
  const cells: [number, number, string][] = [];
  for (let y = 0; y < SPR_H; y++)
    for (let x = 0; x < SPR_W; x++) {
      if (g[y][x] === '.') continue;
      const nx = y;
      const ny = n - 1 - x;
      cells.push([nx, ny, g[y][x]]);
      minY = Math.min(minY, ny);
      maxY = Math.max(maxY, ny);
      minX = Math.min(minX, nx);
      maxX = Math.max(maxX, nx);
    }
  const dy = ANCHOR_Y - 1 - maxY;
  const dx = ANCHOR_X - Math.round((minX + maxX) / 2);
  for (const [x, y, ch] of cells) set(r, x + dx, y + dy, ch);
  return r;
}

export function buildPose(pose: string, frame: number, weapon: number): Grid {
  const g = newGrid();
  const c: Ctx = { g, tx: 14, ty: 18, hx: 15, hy: 8, face: 'n' };
  const withStick = weapon === 1;

  switch (pose) {
    case 'idle': {
      const bob = frame & 1;
      c.ty += bob;
      c.hy += bob;
      armDown(g, 12, 19 + bob);
      legStand(g, 15, 26);
      body(c);
      legStand(g, 20, 26, true);
      armDown(g, 24, 19 + bob, true);
      if (withStick) stickVertical(g, 26, 27 + bob);
      break;
    }
    case 'walk': {
      const f = frame & 3;
      const swing = f === 1 ? -2 : f === 3 ? 2 : 0;
      armDown(g, 12 - swing, 19);
      if (f === 0 || f === 2) {
        legStand(g, 15, 26);
      } else if (f === 1) {
        legStand(g, 13, 26);
      } else {
        legStand(g, 21, 25);
      }
      body(c);
      if (f === 0 || f === 2) legStand(g, 20, 26, true);
      else if (f === 1) legStand(g, 23, 25, true);
      else legStand(g, 14, 26, true);
      armDown(g, 24 + swing, 19, true);
      if (withStick) stickVertical(g, 26 + swing, 27);
      break;
    }
    case 'run': {
      const f = frame & 1;
      c.tx += 1;
      c.hx += 3;
      c.hy += 1;
      armBent(g, 10, 21);
      if (f === 0) legStand(g, 10, 26);
      else legStand(g, 21, 24);
      body(c);
      if (f === 0) legStand(g, 23, 24, true);
      else legStand(g, 12, 26, true);
      armBent(g, 25, 20);
      if (withStick) stickVertical(g, 31, 19);
      break;
    }
    case 'jump': {
      c.face = 's';
      armUp(g, 11, 14, 6);
      legTuck(g, 12, 25);
      body(c);
      legTuck(g, 20, 25, true);
      armUp(g, 25, 14, 6);
      if (withStick) stickVertical(g, 26, 10);
      break;
    }
    case 'punch': {
      const f = frame;
      c.face = f === 1 ? 's' : 'n';
      if (f === 0) {
        c.tx -= 1;
        c.hx -= 1;
        armDown(g, 11, 19);
        legStand(g, 14, 26);
        body(c);
        legStand(g, 21, 26, true);
        armBent(g, 19, 22);
      } else if (f === 1) {
        c.tx += 1;
        c.hx += 2;
        armDown(g, 11, 20);
        legStand(g, 12, 26);
        body(c);
        legStand(g, 22, 26, true);
        armFwd(g, 24, 20, 9);
      } else {
        armDown(g, 12, 19);
        legStand(g, 14, 26);
        body(c);
        legStand(g, 21, 26, true);
        armFwd(g, 24, 21, 4);
      }
      break;
    }
    case 'kick': {
      const f = frame;
      c.face = f === 1 ? 's' : 'n';
      if (f === 0) {
        armDown(g, 12, 19);
        legStand(g, 14, 26);
        body(c);
        legTuck(g, 20, 24, true);
        armDown(g, 24, 19, true);
      } else if (f === 1) {
        c.tx -= 2;
        c.hx -= 2;
        armBent(g, 9, 22);
        legStand(g, 12, 26);
        body(c);
        legKick(g, 20, 24, 14);
        armBent(g, 22, 20);
      } else {
        armDown(g, 12, 19);
        legStand(g, 14, 26);
        body(c);
        legTuck(g, 20, 26, true);
        armDown(g, 24, 19, true);
      }
      break;
    }
    case 'airkick': {
      c.face = 's';
      c.tx -= 1;
      c.hx -= 1;
      armBent(g, 9, 17);
      legTuck(g, 11, 26);
      body(c);
      legKick(g, 20, 26, 14);
      armBent(g, 22, 17);
      break;
    }
    case 'dash': {
      const f = frame & 1;
      c.face = 's';
      c.tx += 3;
      c.hx += 5;
      c.hy += 1;
      armBent(g, 10, 22);
      if (f === 0) legStand(g, 10, 26);
      else legStand(g, 21, 25);
      body(c);
      if (f === 0) legStand(g, 23, 25, true);
      else legStand(g, 12, 26, true);
      armFwd(g, 26, 19, 8);
      break;
    }
    case 'upper': {
      c.face = 's';
      c.ty -= 1;
      c.hy -= 1;
      armDown(g, 11, 18);
      legStand(g, 13, 26);
      body(c);
      legStand(g, 22, 25, true);
      armUp(g, 25, 8, 12);
      break;
    }
    case 'hurt': {
      c.face = 'h';
      c.tx -= 1;
      c.hx -= 3;
      c.hy += 1;
      armUp(g, 10, 15, 6);
      legStand(g, 13, 26);
      body(c);
      legStand(g, 21, 26, true);
      armUp(g, 23, 14, 6);
      break;
    }
    case 'lying': {
      const t = newGrid();
      const lc: Ctx = { g: t, tx: 14, ty: 18, hx: 15, hy: 8, face: 'h' };
      armDown(t, 12, 19);
      legStand(t, 15, 26);
      body(lc);
      legStand(t, 20, 26, true);
      armDown(t, 24, 19, true);
      return lyingFrom(t);
    }
    case 'crouch': {
      c.ty += 7;
      c.hy += 7;
      armDown(g, 12, 26);
      rect(g, 13, 33, 6, 3, 'T', 't');
      body(c);
      rect(g, 20, 33, 7, 3, 'T', 't', true);
      rect(g, 14, 35, 6, 1, 'F', 'f');
      rect(g, 21, 35, 6, 1, 'F', 'f');
      armDown(g, 24, 27, true);
      break;
    }
    case 'swing': {
      const f = frame;
      c.face = f === 0 ? 'n' : 's';
      armDown(g, 11, 19);
      legStand(g, f === 0 ? 14 : 12, 26);
      c.tx += f === 0 ? 0 : 1;
      body(c);
      legStand(g, f === 0 ? 21 : 22, 26, true);
      if (f === 0) {
        armUp(g, 24, 13, 6);
        if (withStick) line(g, 25, 12, 19, 0);
      } else if (f === 1) {
        armFwd(g, 24, 17, 6);
        if (withStick) line(g, 32, 17, 38, 4);
      } else {
        armFwd(g, 24, 22, 6);
        if (withStick) line(g, 32, 22, 38, 34);
      }
      break;
    }
    case 'throw': {
      c.face = 's';
      armFwd(g, 14, 22, 8);
      legStand(g, 14, 26);
      body(c);
      legStand(g, 21, 26, true);
      armFwd(g, 24, 20, 8);
      break;
    }
    case 'pick': {
      return buildPose('crouch', 0, 0);
    }
    case 'hold': {
      const f = frame & 1;
      armUp(g, 12, 7, 13);
      if (f === 0) legStand(g, 15, 26);
      else legStand(g, 13, 26);
      body(c);
      if (f === 0) legStand(g, 20, 26, true);
      else legStand(g, 23, 25, true);
      armUp(g, 24, 7, 13);
      break;
    }
    case 'holdswing': {
      const f = frame;
      const sx = f === 0 ? -5 : f === 1 ? 6 : 0;
      const sy = f === 1 ? 7 : 0;
      c.face = f === 1 ? 's' : 'n';
      c.tx += f === 1 ? 2 : 0;
      c.hx += f === 1 ? 2 : 0;
      armUp(g, 12 + sx, 7 + sy, 13 - sy);
      legStand(g, 14, 26);
      body(c);
      legStand(g, 21, 26, true);
      armUp(g, 24 + sx, 7 + sy, 13 - sy);
      break;
    }
    case 'stomp': {
      const f = frame & 1;
      armDown(g, 12, 19);
      legStand(g, 14, 26);
      body(c);
      if (f === 0) legTuck(g, 20, 21, true);
      else legStand(g, 24, 27, true);
      armDown(g, 24, 19, true);
      break;
    }
    default:
      return buildPose('idle', 0, weapon);
  }
  return g;
}

export function poseFor(st: number, t: number): { pose: string; frame: number } {
  switch (st) {
    case St.Idle: return { pose: 'idle', frame: (t >> 5) & 1 };
    case St.Walk: return { pose: 'walk', frame: (t >> 3) & 3 };
    case St.Run: return { pose: 'run', frame: (t >> 2) & 1 };
    case St.Jump: return { pose: 'jump', frame: 0 };
    case St.Punch: return { pose: 'punch', frame: t < 2 ? 0 : t < 6 ? 1 : 2 };
    case St.Kick: return { pose: 'kick', frame: t < 5 ? 0 : t < 10 ? 1 : 2 };
    case St.AirKick: return { pose: 'airkick', frame: 0 };
    case St.Dash: return { pose: 'dash', frame: (t >> 2) & 1 };
    case St.Upper: return { pose: 'upper', frame: 0 };
    case St.Hurt: return { pose: 'hurt', frame: 0 };
    case St.Down:
    case St.Dead:
    case St.Held: return { pose: 'lying', frame: 0 };
    case St.GetUp:
    case St.Pick: return { pose: 'crouch', frame: 0 };
    case St.Swing: return { pose: 'swing', frame: t < 5 ? 0 : t < 9 ? 1 : 2 };
    case St.Throw: return { pose: 'throw', frame: 0 };
    case St.Lift: return { pose: 'hold', frame: 0 };
    case St.Hold: return { pose: 'hold', frame: (t >> 3) & 1 };
    case St.HoldSwing: return { pose: 'holdswing', frame: t < 6 ? 0 : t < 11 ? 1 : 2 };
    case St.Stomp: return { pose: 'stomp', frame: t < 5 ? 0 : 1 };
    case St.Barrage: return { pose: 'punch', frame: t & 4 ? 1 : 2 };
    case St.Tatsu: return { pose: 'kick', frame: 1 };
    default: return { pose: 'idle', frame: 0 };
  }
}

function outline(g: Grid) {
  const mark: [number, number][] = [];
  for (let y = 0; y < SPR_H; y++)
    for (let x = 0; x < SPR_W; x++) {
      if (g[y][x] !== '.') continue;
      if (
        (x > 0 && g[y][x - 1] !== '.') ||
        (x < SPR_W - 1 && g[y][x + 1] !== '.') ||
        (y > 0 && g[y - 1][x] !== '.') ||
        (y < SPR_H - 1 && g[y + 1][x] !== '.')
      )
        mark.push([x, y]);
    }
  for (const [x, y] of mark) g[y][x] = 'O';
}

function toCanvas(g: Grid, pal: Record<string, string>): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = SPR_W;
  cv.height = SPR_H;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < SPR_H; y++)
    for (let x = 0; x < SPR_W; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  return cv;
}

export class PixelSprites {
  private cache = new Map<string, HTMLCanvasElement>();

  get(def: string, pose: string, frame: number, weapon: number): HTMLCanvasElement {
    const key = `${def}|${pose}|${frame}|${weapon}`;
    let cv = this.cache.get(key);
    if (!cv) {
      const g = buildPose(pose, frame, weapon);
      outline(g);
      cv = toCanvas(g, PALETTES[def] ?? PALETTES.saburo);
      this.cache.set(key, cv);
    }
    return cv;
  }

  draw(ctx: CanvasRenderingContext2D, def: string, st: number, t: number, weapon: number) {
    const { pose, frame } = poseFor(st, t);
    const cv = this.get(def, pose, frame, weapon);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, -ANCHOR_X, -ANCHOR_Y);
  }
}

export const POSE_LIST: { pose: string; frames: number }[] = [
  { pose: 'idle', frames: 2 },
  { pose: 'walk', frames: 4 },
  { pose: 'run', frames: 2 },
  { pose: 'jump', frames: 1 },
  { pose: 'punch', frames: 3 },
  { pose: 'kick', frames: 3 },
  { pose: 'airkick', frames: 1 },
  { pose: 'dash', frames: 2 },
  { pose: 'upper', frames: 1 },
  { pose: 'hurt', frames: 1 },
  { pose: 'lying', frames: 1 },
  { pose: 'crouch', frames: 1 },
  { pose: 'swing', frames: 3 },
  { pose: 'throw', frames: 1 },
  { pose: 'hold', frames: 2 },
  { pose: 'holdswing', frames: 3 },
  { pose: 'stomp', frames: 2 },
];
