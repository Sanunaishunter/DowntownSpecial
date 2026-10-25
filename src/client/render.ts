import { SCREEN_H, SCREEN_W } from '../shared/constants';
import { DEFS } from '../shared/defs';
import { St, type GameEvent, type SnapFighter, type Snapshot } from '../shared/types';
import bossData from '../../data/bosses.json';
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

export function bossName(def: string): string {
  const b = bossData.bosses.find((x) => x.id === def);
  return b ? b.zh : (DEFS[def]?.name ?? def);
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

    for (const it of snap.it) {
      const sx = Math.round(it.x - cam);
      const sy = Math.round(it.y);
      shadow(ctx, sx, sy, it.z, 6);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(sx - 7, sy - 3 - Math.round(it.z), 14, 3);
      ctx.fillStyle = '#c08850';
      ctx.fillRect(sx - 7, sy - 3 - Math.round(it.z), 14, 1);
    }

    const fs = [...snap.f].sort((a, b) => a.y - b.y);
    for (const f of fs) this.drawFighter(f, cam, o.now);

    this.fx = this.fx.filter((e) => o.now - e.t0 < 200);
    for (const e of this.fx) drawSpark(ctx, e, cam, (o.now - e.t0) / 200);

    drawHud(ctx, snap, o);
  }

  private drawFighter(f: SnapFighter, cam: number, now: number) {
    const ctx = this.ctx;
    const dead = f.s === St.Dead;
    if (f.v > 0 && Math.floor(now / 70) % 2 === 0) return;
    if (dead && f.d !== 'kunimasa' && f.d !== 'rikigoro' && Math.floor(now / 90) % 2 === 0) return;
    const ox = Math.round(f.x - cam);
    const oy = Math.round(f.y);
    shadow(ctx, ox, oy, f.z, f.s === St.Down || dead || f.s === St.Held ? 14 : 9);
    ctx.save();
    ctx.translate(ox, oy - Math.round(f.z));
    ctx.scale(f.r, 1);
    const drawn = this.assets.draw(ctx, f.d, f.s, f.t, f.w);
    if (drawn === 0) this.sprites.draw(ctx, f.d, f.s, f.t, f.w);
    else if (drawn === 1 && f.w && (f.s === St.Idle || f.s === St.Walk || f.s === St.Run || f.s === St.Jump)) drawHeldStick(ctx, f.s, f.t);
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
  ctx.strokeStyle = e.k ? '#ffe060' : '#ffffff';
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

function drawHud(ctx: CanvasRenderingContext2D, snap: Snapshot, o: DrawOpts) {
  snap.sl.forEach((s, i) => {
    if (!s.a) return;
    const f = snap.f.find((q) => q.i === s.f);
    const left = i === 0;
    const x = left ? 8 : SCREEN_W - 8 - 70;
    const name = DEFS[f?.d ?? ''] ? DEFS[f!.d].name : `P${i + 1}`;
    text(ctx, name + (i === o.mySlot ? ' ◀' : ''), x, 3);
    bar(ctx, x, 14, 70, f ? f.h : 0, f ? f.m : 1);
    text(ctx, `x${Math.max(0, s.l)}  ${String(s.p).padStart(6, '0')}`, x, 22, '#ffd070');
  });

  const boss = snap.f.find((f) => DEFS[f.d]?.kind === 'boss' && f.s !== St.Dead);
  if (boss) {
    text(ctx, bossName(boss.d), SCREEN_W / 2, 3, '#ff9090', 'center');
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
