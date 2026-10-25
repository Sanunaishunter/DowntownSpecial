import { SCREEN_H, SCREEN_W } from '../shared/constants';
import { DEFS } from '../shared/defs';
import { BEAM, MP_MAX } from '../shared/specials';
import { St, type GameEvent, type SnapFighter, type SnapItem, type Snapshot } from '../shared/types';
import { UNLIMITED, WEAPONS, WID } from '../shared/weapons';
import type { Assets } from './assets';
import { PixelSprites } from './pixelart';

const SIGNS = ['酒', '茶', '宿', '湯'];
const BW = 112;
const HORIZON = 128;

interface Fx {
  x: number;
  y: number;
  z: number;
  k: number;
  t0: number;
}

export interface DrawOpts {
  mySlot: number;
  hint: string;
  now: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private s = 2;
  private fx: Fx[] = [];
  private sprites = new PixelSprites();

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
  ) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('canvas 2d not supported');
    this.ctx = c;
    this.setScale(2);
  }

  setScale(s: number) {
    this.s = s;
    this.canvas.width = SCREEN_W * s;
    this.canvas.height = SCREEN_H * s;
  }

  addFx(events: GameEvent[], now: number) {
    for (const e of events) this.fx.push({ x: e[0], y: e[1], z: e[2], k: e[3], t0: now });
    if (this.fx.length > 40) this.fx.splice(0, this.fx.length - 40);
  }

  draw(snap: Snapshot | null, o: DrawOpts) {
    const ctx = this.ctx;
    ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cam = snap ? snap.c : 0;
    drawBackground(ctx, cam);
    if (!snap) return;

    for (const it of snap.it) drawItem(ctx, it, cam);

    const fs = [...snap.f].sort((a, b) => a.y - b.y);
    for (const f of fs) this.drawFighter(f, cam, o.now);
    for (const f of fs) if (f.s === St.Beam) drawBeam(ctx, f, cam, o.now);
    for (const s of snap.sh) drawShot(ctx, s, cam, o.now);

    this.fx = this.fx.filter((e) => o.now - e.t0 < 200);
    for (const e of this.fx) drawSpark(ctx, e, cam, (o.now - e.t0) / 200);

    drawHud(ctx, snap, o);
  }

  private drawFighter(f: SnapFighter, cam: number, now: number) {
    const ctx = this.ctx;
    const dead = f.s === St.Dead;
    if (f.v > 2 && Math.floor(now / 70) % 2 === 0) return;
    if (dead && DEFS[f.d]?.kind !== 'player' && Math.floor(now / 90) % 2 === 0) return;
    const ox = Math.round(f.x - cam);
    const oy = Math.round(f.y);
    shadow(ctx, ox, oy, f.z, f.s === St.Down || dead || f.s === St.Held ? 14 : 9);
    ctx.save();
    ctx.translate(ox, oy - Math.round(f.z));
    ctx.scale(f.r, 1);
    const hasArt = f.w > 1 && this.assets.hasArmed(f.d, f.w);
    const art = artFor(f, hasArt);
    const drawn = this.assets.draw(ctx, f.d, f.s, art.t, art.weapon, art.anim);
    if (drawn === 0) this.sprites.draw(ctx, f.d, f.s, f.t, f.w);
    else if (drawn === 1 && f.w === WID.Stick && (f.s === St.Idle || f.s === St.Walk || f.s === St.Run || f.s === St.Jump)) drawHeldStick(ctx, f.s, f.t);
    if (!hasArt) drawWeaponInHand(ctx, f);
    else if (f.s === St.Shoot && f.t >= 2 && f.t <= 5) drawMuzzleFlash(ctx, this.assets.muzzle(f.d));
    ctx.restore();
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, rx: number) {
  const r = Math.max(4, rx - z / 6);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Which sheet animation to use for a fighter. The stick has its own armed poses baked in;
// other weapons reuse unarmed poses and are drawn on top.
function artFor(f: SnapFighter, hasArt: boolean): { weapon: number; anim?: string; t: number } {
  if (f.s === St.Beam) return { weapon: 0, anim: f.t >= BEAM.charge + BEAM.fire ? 'beamend' : 'beam', t: f.t };
  if ((f.s === St.Idle || f.s === St.Walk || f.s === St.Run) && f.c > 0) return { weapon: 0, anim: 'cast', t: 0 };
  if (!f.w) return { weapon: 0, t: f.t };
  if (f.w === WID.Stick || hasArt) return { weapon: f.w, t: f.t };
  switch (f.s) {
    case St.Swing:
    case St.Shoot:
      return { weapon: 0, anim: 'punch', t: f.t };
    case St.Idle:
    case St.Walk:
    case St.Run:
    case St.Jump:
      return { weapon: 0, anim: f.w === WID.Stone ? 'hold' : undefined, t: f.t };
    default:
      return { weapon: 0, t: f.t };
  }
}

// Draws a weapon pointing along +x with the grip at the origin.
function weaponGfx(ctx: CanvasRenderingContext2D, kind: number) {
  const R = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  switch (kind) {
    case WID.Stick:
      R('#805020', -3, -1, 28, 3);
      R('#c88840', -3, -1, 28, 1);
      break;
    case WID.Bamboo:
      R('#101010', -5, -2, 8, 5);
      R('#3a2a1c', -5, -1, 7, 3);
      R('#e8d080', 2, -1, 24, 3);
      R('#b89c48', 2, 1, 24, 1);
      R('#a08030', 9, -1, 1, 3);
      R('#a08030', 17, -1, 1, 3);
      R('#2a2a2a', 1, -2, 2, 5);
      break;
    case WID.Saber:
      R('rgba(80,230,255,0.28)', 4, -3, 29, 7);
      R('#4de6ff', 4, -1, 27, 3);
      R('#ffffff', 4, 0, 27, 1);
      R('#b0b0b8', -4, -1, 8, 3);
      R('#606068', -1, -1, 1, 3);
      R('#606068', 2, -1, 1, 3);
      break;
    case WID.Stone:
      ctx.fillStyle = '#101018';
      ctx.beginPath();
      ctx.ellipse(6, 0, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a6a74';
      ctx.beginPath();
      ctx.ellipse(6, 0, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a9aa6';
      ctx.fillRect(2, -3, 4, 2);
      R('#4a4a54', 7, 1, 4, 2);
      break;
    case WID.Rifle:
      R('#6a3c18', -7, -1, 9, 4);
      R('#2c2c32', 2, -2, 13, 4);
      R('#4c4c56', 2, -2, 13, 1);
      R('#2c2c32', 15, -1, 10, 2);
      R('#7a4a20', 14, 0, 7, 2);
      R('#2c2c32', 6, 2, 3, 6);
      break;
    default:
      break;
  }
}

function drawWeaponInHand(ctx: CanvasRenderingContext2D, f: SnapFighter) {
  const k = f.w;
  if (!k || k === WID.Stick) return;
  if (f.s === St.Down || f.s === St.Dead || f.s === St.Held || f.s === St.Hurt || f.s === St.Beam) return;
  const wd = WEAPONS[k];
  ctx.save();
  if (f.s === St.Swing) {
    const p = Math.min(1, f.t / (wd.atk.start + wd.atk.active + 2));
    ctx.translate(9, -22);
    ctx.rotate(-1.9 + p * 2.5);
    weaponGfx(ctx, k);
  } else if (f.s === St.Shoot) {
    ctx.translate(9, -22);
    ctx.rotate(-0.05);
    weaponGfx(ctx, k);
    if (f.t >= 2 && f.t <= 5) {
      ctx.fillStyle = '#fff2a0';
      ctx.fillRect(25, -4, 6, 7);
      ctx.fillStyle = '#ff9a30';
      ctx.fillRect(28, -2, 6, 3);
    }
  } else if (k === WID.Stone) {
    ctx.translate(-4, -49);
    weaponGfx(ctx, k);
  } else if (k === WID.Rifle) {
    ctx.translate(8, -21);
    ctx.rotate(-0.08);
    weaponGfx(ctx, k);
  } else {
    ctx.translate(11, -19);
    ctx.rotate(-Math.PI / 2 + 0.1);
    weaponGfx(ctx, k);
  }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: SnapItem, cam: number) {
  const sx = Math.round(it.x - cam);
  const sy = Math.round(it.y);
  shadow(ctx, sx, sy, it.z, 7);
  ctx.save();
  ctx.translate(sx - (it.k === WID.Stone ? 6 : 10), sy - 3 - Math.round(it.z));
  weaponGfx(ctx, it.k);
  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, s: { k: number; x: number; y: number; z: number; r: 1 | -1 }, cam: number, now: number) {
  const sx = Math.round(s.x - cam);
  const sy = Math.round(s.y - s.z);
  if (s.k === 1) {
    for (let i = 1; i <= 4; i++) {
      ctx.fillStyle = `rgba(255,160,50,${0.32 - i * 0.06})`;
      ctx.beginPath();
      ctx.arc(sx - s.r * i * 4, sy, 5 - i * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    const pulse = 1 + Math.sin(now / 40) * 0.5;
    ctx.fillStyle = 'rgba(255,140,40,0.45)';
    ctx.beginPath();
    ctx.arc(sx, sy, 7 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb040';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4cc';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,176,48,0.55)';
    ctx.fillRect(s.r > 0 ? sx - 14 : sx + 4, sy, 10, 1);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(s.r > 0 ? sx - 5 : sx, sy, 6, 1);
  }
}

function drawBeam(ctx: CanvasRenderingContext2D, f: SnapFighter, cam: number, now: number) {
  const sy = Math.round(f.y - f.z) - 20;
  const hx = Math.round(f.x - cam) + f.r * 14;
  const orb = (r: number) => {
    ctx.fillStyle = 'rgba(60,170,255,0.35)';
    ctx.beginPath();
    ctx.arc(hx, sy, r * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5ae8ff';
    ctx.beginPath();
    ctx.arc(hx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, sy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  };
  if (f.t < BEAM.charge) {
    orb(2 + (f.t / BEAM.charge) * 6 + Math.sin(now / 30));
    return;
  }
  const fireT = f.t - BEAM.charge;
  if (fireT >= BEAM.fire) return;
  const th = 4 + Math.sin(now / 55) * 1.2 + Math.min(4, fireT / 6);
  const len = BEAM.len;
  const x0 = f.r > 0 ? hx : hx - len;
  ctx.fillStyle = 'rgba(60,170,255,0.28)';
  ctx.fillRect(x0, Math.round(sy - th * 1.7), len, Math.round(th * 3.4));
  ctx.fillStyle = 'rgba(90,230,255,0.8)';
  ctx.fillRect(x0, Math.round(sy - th), len, Math.round(th * 2));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, Math.round(sy - th * 0.4), len, Math.max(1, Math.round(th * 0.8)));
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 9; i++) {
    const off = (((i * 37 + (now / 5) * f.r) % len) + len) % len;
    ctx.fillRect(Math.round(x0 + off), Math.round(sy + ((i * 7) % 9) - 4), 5, 1);
  }
  orb(6 + Math.sin(now / 35));
}

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, muzzle: [number, number]) {
  ctx.fillStyle = '#fff2a0';
  ctx.fillRect(muzzle[0], muzzle[1] - 3, 6, 7);
  ctx.fillStyle = '#ff9a30';
  ctx.fillRect(muzzle[0] + 3, muzzle[1] - 1, 6, 3);
}

function drawHeldStick(ctx: CanvasRenderingContext2D, st: number, t: number) {
  if (st === St.Down || st === St.Dead || st === St.Held) return;
  ctx.save();
  ctx.translate(10, -14);
  if (st === St.Swing) ctx.rotate(-1.9 + Math.min(1, t / 9) * 2.5);
  else ctx.translate(0, -2);
  ctx.fillStyle = '#805020';
  if (st === St.Swing) ctx.fillRect(0, -2, 24, 3);
  else ctx.fillRect(0, -18, 3, 22);
  ctx.fillStyle = '#c88840';
  if (st === St.Swing) ctx.fillRect(0, -2, 24, 1);
  else ctx.fillRect(0, -18, 1, 22);
  ctx.restore();
}

function drawSpark(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const cx = e.x - cam;
  const cy = e.y - e.z;
  const len = (e.k ? 9 : 6) * (0.5 + k);
  ctx.strokeStyle = e.k === 2 ? '#c8c8d0' : e.k ? '#ffe060' : '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    ctx.moveTo(cx + Math.cos(a) * len * 0.35, cy + Math.sin(a) * len * 0.35);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
  }
  ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D, cam: number) {
  const R = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), y, w, h);
  };
  R('#7ec4e8', 0, 0, SCREEN_W, 72);
  for (let i = 0; i < 5; i++) {
    const cx = ((((i * 120 - cam * 0.25) % 360) + 360) % 360) - 60;
    R('#ffffff', cx, 14 + (i % 3) * 9, 36, 7);
    R('#ffffff', cx + 8, 10 + (i % 3) * 9, 22, 5);
  }
  const first = Math.floor(cam / BW);
  const last = Math.floor((cam + SCREEN_W) / BW);
  for (let i = first; i <= last; i++) drawBuilding(ctx, i * BW - cam, Math.abs(i) % 4);

  R('#d99a3a', 0, HORIZON, SCREEN_W, SCREEN_H - HORIZON);
  R('#a8742a', 0, HORIZON, SCREEN_W, 3);
  for (const y of [148, 168, 192, 218]) R('#cf8f33', 0, y, SCREEN_W, 1);
  for (let i = 0; i < 26; i++) {
    const x = ((((i * 53 - cam) % SCREEN_W) + SCREEN_W) % SCREEN_W) | 0;
    R('#c07d28', x, 132 + ((i * 37) % 88), 3, 1);
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, x0: number, v: number) {
  const R = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), y, w, h);
  };
  const wall = ['#efe3c4', '#e6d3a8', '#f2e8d0', '#dcc7a0'][v];
  R('#3b4150', x0 + 2, 50, BW - 4, 8);
  R('#2c313d', x0, 58, BW, 10);
  for (let k = 0; k < BW; k += 8) R('#454c5e', x0 + k, 60, 1, 8);
  R(wall, x0 + 4, 68, BW - 8, HORIZON - 68);
  R('#6b4423', x0 + 4, 68, 4, HORIZON - 68);
  R('#6b4423', x0 + BW - 8, 68, 4, HORIZON - 68);
  R('#6b4423', x0 + 4, 68, BW - 8, 3);
  R('#4a3320', x0 + 14, 80, 30, 26);
  for (let k = 0; k < 4; k++) R('#caa86a', x0 + 16 + k * 7, 82, 2, 22);
  R('#caa86a', x0 + 14, 92, 30, 2);
  R('#1d2b58', x0 + 56, 84, 40, 44);
  R(wall, x0 + 75, 84, 2, 44);
  ctx.fillStyle = '#f4f4f4';
  ctx.beginPath();
  ctx.arc(Math.round(x0 + 66), 106, 5, 0, Math.PI * 2);
  ctx.fill();
  R('#2a2a2a', x0 + 60, 72, 32, 11);
  ctx.fillStyle = '#fff';
  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(SIGNS[v], Math.round(x0 + 71), 73);
  if (v === 1 || v === 3) {
    ctx.fillStyle = '#d02828';
    ctx.beginPath();
    ctx.arc(Math.round(x0 + 50), 94, 5, 0, Math.PI * 2);
    ctx.fill();
    R('#222', x0 + 48, 86, 4, 3);
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#fff', align: CanvasTextAlign = 'left', size = 8) {
  ctx.font = `bold ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000';
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, max: number) {
  const k = Math.max(0, Math.min(1, hp / max));
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, 7);
  ctx.fillStyle = '#601010';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = k > 0.5 ? '#40d040' : k > 0.25 ? '#e0c030' : '#e03030';
  ctx.fillRect(x, y, Math.round(w * k), 5);
}

function energyBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, e: number, now: number) {
  const k = Math.max(0, Math.min(1, e / MP_MAX));
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = '#10243e';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = k >= 1 && Math.floor(now / 110) % 2 === 0 ? '#ffffff' : '#38c8ff';
  ctx.fillRect(x, y, Math.round(w * k), 3);
}

function drawHud(ctx: CanvasRenderingContext2D, snap: Snapshot, o: DrawOpts) {
  snap.sl.forEach((s, i) => {
    if (!s.a) return;
    const f = snap.f.find((q) => q.i === s.f);
    const left = i === 0;
    const x = left ? 8 : SCREEN_W - 8 - 70;
    const name = DEFS[f?.d ?? ''] ? DEFS[f!.d].name : `P${i + 1}`;
    text(ctx, name + (i === o.mySlot ? ' ◀' : ''), x, 3);
    bar(ctx, x, 14, 70, f ? f.h : 0, f ? f.m : 1);
    energyBar(ctx, x, 21, 70, f ? f.e : 0, o.now);
    text(ctx, `x${Math.max(0, s.l)}  ${String(s.p).padStart(6, '0')}`, x, 26, '#ffd070');
    if (f && f.w) {
      const wd = WEAPONS[f.w];
      text(ctx, `${wd.name}${wd.uses < UNLIMITED ? ` ${f.n}` : ''}`, x, 35, '#bfe8ff');
    }
  });

  const boss = snap.f.find((f) => DEFS[f.d]?.kind === 'boss' && f.s !== St.Dead);
  if (boss) {
    text(ctx, DEFS[boss.d].name, SCREEN_W / 2, 3, '#ff9090', 'center');
    bar(ctx, SCREEN_W / 2 - 40, 14, 80, boss.h, boss.m);
  }

  if (snap.s === 0 && snap.lk === 0 && snap.wv < snap.wt && Math.floor(o.now / 400) % 2 === 0) {
    text(ctx, 'GO ▶', SCREEN_W - 12, 96, '#fff', 'right', 14);
  }
  if (snap.s === 1) {
    text(ctx, 'STAGE CLEAR', SCREEN_W / 2, 92, '#ffe060', 'center', 20);
  } else if (snap.s === 2) {
    text(ctx, 'GAME OVER', SCREEN_W / 2, 92, '#ff6060', 'center', 20);
  }
  if (o.hint) text(ctx, o.hint, SCREEN_W / 2, SCREEN_H - 12, '#ffffff', 'center');
}
