import { SCREEN_H, SCREEN_W, STAGE_W } from '../shared/constants';
import { ONSEN } from '../shared/onsen';
import { CRY_TEXT, EV_AWAKEN, EV_CRIT, EV_DAMAGE, EV_RAIN, EV_ZAP } from '../shared/feel';
import { DEFS } from '../shared/defs';
import { BEAM, HALO, MP_MAX, SPECIALS } from '../shared/specials';
import { St, type GameEvent, type SnapFighter, type SnapItem, type Snapshot } from '../shared/types';
import { GATLING, ITEM_1UP, ITEM_TONIC, UNLIMITED, WEAPONS, WID } from '../shared/weapons';
import type { Assets } from './assets';
import { PixelSprites } from './pixelart';

const SIGNS = ['酒', '茶', '宿', '湯'];
const BW = 112;
const HORIZON = 128;
const LAP_FADE_MS = 1400;
const HUD_BAR_MAX = 112;

interface Fx {
  x: number;
  y: number;
  z: number;
  k: number;
  t0: number;
  /** damage, for the numbers */
  v: number;
}

/** Width of the picture being drawn: 256, or wider in the wide view. Set at the start of every frame. */
let VW = SCREEN_W;

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
  private buffT0 = new Map<string, number>();
  private fxCanvas = document.createElement('canvas');
  private goldCanvas = document.createElement('canvas');
  private lap = 0;
  private stg = 0;
  private shakeT0 = -1e9;
  private rainT0 = -1e9;
  private combo = [
    { n: 0, t0: -1e9 },
    { n: 0, t0: -1e9 },
  ];
  private lapT0 = -1e9;

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
  ) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('canvas 2d not supported');
    this.ctx = c;
    this.setScale(2);
  }

  /** The picture width the canvas is sized for; main.ts re-fits the page when it changes. */
  viewW = SCREEN_W;
  onViewChange: (() => void) | null = null;

  setScale(s: number) {
    this.s = s;
    this.canvas.width = this.viewW * s;
    this.canvas.height = SCREEN_H * s;
  }

  addFx(events: GameEvent[], now: number) {
    for (const e of events) {
      // the rain is kept apart, so the hundred damage numbers it makes cannot push it out of the list
      if (e[3] === EV_RAIN) {
        this.rainT0 = now;
        continue;
      }
      this.fx.push({ x: e[0], y: e[1], z: e[2], k: e[3], t0: now, v: e[4] ?? 0 });
      if (e[3] === EV_CRIT || e[3] === EV_AWAKEN) this.shakeT0 = now;
    }
    if (this.fx.length > 110) this.fx.splice(0, this.fx.length - 110);
  }

  draw(snap: Snapshot | null, o: DrawOpts) {
    const ctx = this.ctx;
    const vw = snap?.vw ?? this.viewW;
    if (vw !== this.viewW) {
      this.viewW = vw;
      this.setScale(this.s);
      this.onViewChange?.();
    }
    VW = vw;
    ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cam = snap ? snap.c : 0;
    // a critical hit shakes the whole picture for a moment
    const charging = snap?.f.some((f) => f.b & 1024 && f.ch > 150) ?? false;
    // 萬箭齊發 rattles it for the whole second the arrows are loosed
    const rainAge = o.now - this.rainT0;
    const shake = Math.max(charging ? 0.3 : 0, 1 - (o.now - this.shakeT0) / 170, rainAge < 1100 ? 1.6 * (1 - rainAge / 1500) : 0);
    const shx = Math.round(Math.sin(o.now * 0.09) * 3 * shake);
    const shy = Math.round(Math.cos(o.now * 0.13) * 2.5 * shake);
    ctx.translate(shx, shy);
    if (snap?.sg === 1) {
      if (!this.assets.drawOnsen(ctx, VW)) drawOnsenFallback(ctx);
      drawOnsenSteam(ctx, o.now);
    } else {
      if (!this.assets.drawBackdrop(ctx, cam, VW)) drawBackground(ctx, cam);
      tintForTime(ctx, cam);
    }
    if (!snap) return;

    // 天雷萬鈞: the whole picture darkens while the storm lasts and flashes white on every strike
    if (snap.f.some((f) => f.b & 16)) {
      ctx.fillStyle = 'rgba(24,16,64,0.3)';
      ctx.fillRect(0, 0, VW, SCREEN_H);
    }
    for (const e of this.fx) {
      const age = o.now - e.t0;
      if (e.k === 4 && age < 90) {
        ctx.fillStyle = `rgba(255,255,255,${0.32 * (1 - age / 90)})`;
        ctx.fillRect(0, 0, VW, SCREEN_H);
      }
      if (e.k === EV_AWAKEN && age < 500) {
        ctx.fillStyle = `rgba(255,238,160,${0.55 * (1 - age / 500)})`;
        ctx.fillRect(-4, -4, VW + 8, SCREEN_H + 8);
      }
      if (e.k === EV_CRIT && age < 110) {
        ctx.fillStyle = `rgba(255,236,190,${0.22 * (1 - age / 110)})`;
        ctx.fillRect(-4, -4, VW + 8, SCREEN_H + 8);
      }
    }

    if (rainAge >= 0 && rainAge < 1900) {
      // the picture dims to a deep blue, with a white flash as the move begins
      ctx.fillStyle = `rgba(8,14,48,${0.5 * Math.min(1, rainAge / 120, (1900 - rainAge) / 500)})`;
      ctx.fillRect(-6, -6, VW + 12, SCREEN_H + 12);
      if (rainAge < 140) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - rainAge / 140)})`;
        ctx.fillRect(-6, -6, VW + 12, SCREEN_H + 12);
      }
    }

    for (const it of snap.it) drawItem(ctx, it, cam, o.now, this.assets);

    for (const f of snap.f) {
      const key = `${f.i}:circle`;
      if (f.hl.length) {
        if (!this.buffT0.has(key)) this.buffT0.set(key, o.now);
        drawHaloCircle(ctx, Math.round(f.hl[0] - cam), Math.round(f.hl[1]), o.now - this.buffT0.get(key)!, f.hl[2], f.i);
      } else this.buffT0.delete(key);
    }

    const fs = [...snap.f].sort((a, b) => a.y - b.y);
    for (const f of fs) this.drawFighter(f, cam, o.now);
    for (const f of fs) if (f.s === St.Beam) drawBeam(ctx, f, cam, o.now);
    for (const s of snap.sh) drawShot(ctx, s, cam, o.now, this.assets);

    this.fx = this.fx.filter((e) => o.now - e.t0 < (e.k === 4 ? 280 : e.k === 5 ? 800 : e.k === EV_DAMAGE ? 650 : e.k === EV_CRIT ? 950 : e.k === EV_ZAP ? 260 : e.k === EV_AWAKEN ? 800 : 200));
    for (const e of this.fx) {
      if (e.k === 4) drawBolt(ctx, e, cam, (o.now - e.t0) / 280);
      else if (e.k === 5) drawSplash(ctx, e, cam, (o.now - e.t0) / 800);
      else if (e.k === EV_DAMAGE || e.k === EV_CRIT) drawDamage(ctx, e, cam, o.now - e.t0);
      else if (e.k === EV_ZAP) drawZap(ctx, e, cam, (o.now - e.t0) / 260);
      else if (e.k === EV_AWAKEN) drawAwaken(ctx, e, cam, (o.now - e.t0) / 800);
      else drawSpark(ctx, e, cam, (o.now - e.t0) / 200);
    }
    // special moves are shouted out loud
    for (const f of snap.f) if (f.cr && CRY_TEXT[f.cr]) drawBubble(ctx, f.x - cam, f.y - Math.round(f.z) - 56, CRY_TEXT[f.cr], '#d01818');
    if (snap.sg === 1 && snap.ph === 0) drawOnsenTalk(ctx, snap);

    ctx.translate(-shx, -shy);
    drawHud(ctx, snap, o);
    this.drawCombo(snap, o.now);
    if (rainAge >= 0 && rainAge < 1900) drawRainTitle(ctx, rainAge);
    if (snap.bn.length) drawBanner(ctx, snap.bn[0], snap.bn[1]);

    // a new lap or stage: cut to black on the stage start, then fade the title and the picture back in
    if (snap.lp !== this.lap || snap.sg !== this.stg) {
      if (snap.lp > this.lap || snap.sg !== this.stg) this.lapT0 = o.now;
      this.lap = snap.lp;
      this.stg = snap.sg;
    }
    const fade = 1 - (o.now - this.lapT0) / LAP_FADE_MS;
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade * 1.6)})`;
      ctx.fillRect(0, 0, VW, SCREEN_H);
      ctx.globalAlpha = Math.min(1, fade * 2);
      if (snap.sg === 1) {
        text(ctx, '溫泉關', VW / 2, 88, '#ffe060', 'center', 20);
        text(ctx, `第 ${snap.lp + 1} 周`, VW / 2, 114, '#ffffff', 'center', 12);
      } else {
        text(ctx, '東海道', VW / 2, 88, '#ffe060', 'center', 20);
        text(ctx, `第 ${snap.lp + 1} 周`, VW / 2, 114, '#ffffff', 'center', 12);
      }
      ctx.globalAlpha = 1;
    }
  }

  // 攻擊N: how many blows each hero has landed in a row, at the bottom of the screen; it jumps on every new blow.
  private drawCombo(snap: Snapshot, now: number) {
    const ctx = this.ctx;
    snap.sl.forEach((s, i) => {
      if (!s.a || i > 1) return;
      const n = snap.f.find((q) => q.i === s.f)?.cb ?? 0;
      const st = this.combo[i];
      if (n !== st.n) {
        if (n > 0) st.t0 = now;
        st.n = n;
      }
      if (n <= 0) return;
      const bump = Math.max(0, 1 - (now - st.t0) / 160);
      const tier = n < 10 ? 0 : n < 25 ? 1 : n < 50 ? 2 : 3;
      const size = (15 + tier * 3 + Math.min(6, n / 25)) * (1 + 0.5 * bump);
      const jit = tier >= 3 ? Math.round(Math.sin(now * 0.11)) : 0;
      const cx = i === 0 ? 78 : VW - 78;
      const y = SCREEN_H - 24;
      const fontOf = (px: number) => `900 ${px}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = fontOf(size);
      const wn = ctx.measureText(String(n)).width;
      ctx.font = fontOf(9);
      const wl = ctx.measureText('攻擊').width;
      const x0 = Math.round(cx - (wl + 4 + wn) / 2);
      const col = ['#ffffff', '#ffe060', '#ff9030', '#ff4040'][tier];
      outlined(ctx, '攻擊', x0, y, fontOf(9), '#ffffff', 2.5);
      outlined(ctx, String(n), x0 + wl + 4, y + jit, fontOf(size), col, 3.5);
      ctx.restore();
    });
  }

  private drawFighter(f: SnapFighter, cam: number, now: number) {
    const ctx = this.ctx;
    const dead = f.s === St.Dead;
    if (f.v > 2 && Math.floor(now / 70) % 2 === 0) return;
    if (dead && DEFS[f.d]?.kind !== 'player' && Math.floor(now / 90) % 2 === 0) return;
    const ox = Math.round(f.x - cam);
    const oy = Math.round(f.y);
    shadow(ctx, ox, oy, f.z, f.s === St.Down || dead || f.s === St.Held ? 14 : 9);
    if (!dead && f.b & 96) {
      // 溫泉關 elites carry a red ring on the ground, the traitor a purple one
      ctx.strokeStyle = f.b & 64 ? 'rgba(190,100,255,0.9)' : 'rgba(255,60,60,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ox, oy, f.b & 64 ? 15 : 12, f.b & 64 ? 5.5 : 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const since = (kind: string, on: boolean) => {
      const key = `${f.i}:${kind}`;
      if (!on) {
        this.buffT0.delete(key);
        return 0;
      }
      if (!this.buffT0.has(key)) this.buffT0.set(key, now);
      return now - this.buffT0.get(key)!;
    };
    const auraMs = since('aura', !!(f.b & 1));
    const shieldMs = since('shield', !!(f.b & 2));
    const chargeMs = since('charge', !!(f.b & 1024));
    const goldMs = since('gold', !!(f.b & 512));
    if (f.b & 1024) this.drawChargeFx(f, ox, oy, now, chargeMs);
    if (f.b & 513) this.drawAura(f, ox, oy, now, f.b & 1 ? auraMs : goldMs);
    const tatsu = f.s === St.Tatsu;
    const whirl = f.s === St.Whirl;
    if (tatsu) drawTornado(ctx, ox, oy - Math.round(f.z), f.t, true);
    const blades: [number, number] = f.w2 ? [f.w, f.w2] : [f.w, f.w];
    // the twin swords have their own whirling picture; without it the arms and blades are drawn here
    const whirlGfx = whirl && !(f.w === WID.Twin && !f.w2 && this.assets.hasArmed(f.d, f.w));
    if (whirlGfx) drawWhirl(ctx, ox, oy - Math.round(f.z), f.t, false, blades);
    ctx.save();
    ctx.translate(ox, oy - Math.round(f.z));
    // 龍捲風腳 / 炫風斬: the body spins around its own axis, which on a flat sprite is a quick flip
    const spin = tatsu ? Math.cos(f.t * 0.95) : whirl ? Math.cos(f.t * 0.6) : 1;
    ctx.scale(f.r * (tatsu || whirl ? (Math.abs(spin) < 0.25 ? 0.25 * Math.sign(spin || 1) : spin) : 1), 1);
    if (f.b & 512) this.paintGold(ctx, f);
    else this.paint(ctx, f);
    ctx.restore();
    if (f.b & 256) drawBurn(ctx, ox, oy - Math.round(f.z), now, f.i);
    if (f.s === St.Staff) drawStaffSpin(ctx, ox, oy - Math.round(f.z), now);
    if (f.s === St.Thrust || f.s === St.Flourish) drawSpearFx(ctx, ox, oy - Math.round(f.z), f.r, f.s === St.Thrust, f.t);
    if (tatsu) drawTornado(ctx, ox, oy - Math.round(f.z), f.t, false);
    if (whirlGfx) drawWhirl(ctx, ox, oy - Math.round(f.z), f.t, true, blades);
    if (f.s === St.Barrage) drawBarrage(ctx, ox, oy - Math.round(f.z), f.r, f.t);
    if (f.w === WID.Gatling && f.ht > GATLING.overheat) drawSteam(ctx, ox + f.r * 38, oy - Math.round(f.z) - 21, now);
    if (f.b & 2) drawShield(ctx, ox + f.r * 15, oy - Math.round(f.z), shieldMs, now, !!(f.b & 8));
  }

  // 金光覺醒: the hair of the golden form. The figure is drawn on a small canvas first, and the dark pixels inside the top of the
  // head (the hair, not its outline and not the eyes) are painted gold.
  private paintGold(ctx: CanvasRenderingContext2D, f: SnapFighter) {
    const W = 96;
    const H = 96;
    const ax = 48;
    const ay = 76;
    const c = this.goldCanvas;
    if (c.width !== W) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(ax, ay);
    this.paint(g, f);
    g.restore();
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
    const dark = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 120;
    };
    const out: number[] = [];
    for (let y = ay - 40; y <= ay - 29; y++) {
      for (let x = 0; x < W; x++) {
        if (dark(x, y) && solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) out.push(x, y);
      }
    }
    for (let k = 0; k < out.length; k += 2) {
      const x = out[k];
      const y = out[k + 1];
      const i = (y * W + x) * 4;
      const hi = ((x + y * 2) & 3) === 0;
      d[i] = hi ? 255 : 246;
      d[i + 1] = hi ? 238 : 196;
      d[i + 2] = hi ? 120 : 40;
    }
    g.putImageData(img, 0, 0);
    ctx.drawImage(c, -ax, -ay);
  }

  // 集氣: a blue-white aura that grows with the charge, pebbles lifted off the ground, and rings of light on the floor.
  private drawChargeFx(f: SnapFighter, ox: number, oy: number, now: number, ms: number) {
    const ctx = this.ctx;
    const k = Math.min(1, f.ch / 420);
    const baseY = oy - Math.round(f.z);
    ctx.save();
    for (let r = 0; r < 3; r++) {
      const p = ((now / 700 + r / 3) % 1);
      ctx.strokeStyle = `rgba(190,230,255,${(1 - p) * (0.35 + 0.4 * k)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ox, baseY, 8 + p * (16 + 14 * k), 3 + p * (6 + 5 * k), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#7a6a58';
    for (let i = 0; i < 6 + Math.round(8 * k); i++) {
      const life = (now / 900 + i * 0.173 + f.i * 0.21) % 1;
      const px = ox + Math.round(Math.sin(i * 7.7 + f.i) * (10 + 10 * k));
      const py = baseY - 1 - Math.round(life * (22 + 24 * k));
      ctx.globalAlpha = 1 - life * 0.7;
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.restore();
    this.drawAura(f, ox, oy, now, ms, 'charge', 0.35 + 0.65 * k);
  }

  // Draws the fighter at the origin of an already translated and flipped context.
  private paint(ctx: CanvasRenderingContext2D, f: SnapFighter) {
    const hasArt = f.w > 1 && !f.w2 && this.assets.hasArmed(f.d, f.w);
    const art = artFor(f, hasArt);
    const drawn = this.assets.draw(ctx, f.d, f.s, art.t, art.weapon, art.anim);
    if (drawn === 0) this.sprites.draw(ctx, f.d, f.s, f.t, f.w);
    else if (drawn === 1 && f.w === WID.Stick && (f.s === St.Idle || f.s === St.Walk || f.s === St.Run || f.s === St.Jump)) drawHeldStick(ctx, f.s, f.t);
    if (!hasArt) drawWeaponInHand(ctx, f);
    else if (f.s === St.Shoot && f.t >= 2 && f.t <= 5 && f.w !== WID.Bow) drawMuzzleFlash(ctx, this.assets.muzzle(f.d));
  }

  // 爆氣: a flickering gold outline around the whole body plus flames rising from it.
  private drawAura(f: SnapFighter, ox: number, oy: number, now: number, ms: number, kind: 'gold' | 'charge' = 'gold', power = 1) {
    const ctx = this.ctx;
    const col = kind === 'charge' ? { fill: '#a8dcff', flame: '#7cc8ff', core: '#ffffff', spark: '#d8f0ff' } : { fill: '#ffd23a', flame: '#ffb81c', core: '#fff2a0', spark: '#fff6b0' };
    const fade = f.b & 8 ? 0.45 + 0.4 * Math.sin(now / 45) : 1;
    const fx = this.fxCanvas;
    const W = 112;
    const H = 112;
    if (fx.width !== W) {
      fx.width = W;
      fx.height = H;
    }
    const g = fx.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(W / 2, H - 20 - Math.round(f.z));
    g.scale(f.r, 1);
    this.paint(g, f);
    g.restore();
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = col.fill;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    const pulse = 2 + Math.round(Math.sin(now / 55) + Math.sin(now / 37));
    const x0 = ox - W / 2;
    const y0 = oy - (H - 20);
    ctx.save();
    // flame tongues licking up behind the body
    ctx.globalAlpha = 0.7 * fade * Math.min(1, ms / 150) * power;
    const base = oy - Math.round(f.z) - 10;
    for (let i = 0; i < 7; i++) {
      const bx = ox + (i - 3) * 5;
      const hgt = 16 + Math.round(10 * Math.sin(now / 70 + i * 1.9)) + (i % 2 ? 6 : 0) - Math.abs(i - 3) * 2;
      ctx.fillStyle = col.flame;
      ctx.beginPath();
      ctx.moveTo(bx - 4, base);
      ctx.lineTo(bx + 4, base);
      ctx.lineTo(bx + (i % 3) - 1, base - hgt - 14);
      ctx.fill();
      ctx.fillStyle = col.core;
      ctx.beginPath();
      ctx.moveTo(bx - 2, base);
      ctx.lineTo(bx + 2, base);
      ctx.lineTo(bx, base - hgt - 4);
      ctx.fill();
    }
    ctx.globalAlpha = 0.6 * fade * Math.min(1, ms / 150) * power;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1]]) {
      ctx.drawImage(fx, x0 + dx * (pulse + 2), y0 + dy * (pulse + 2) - 1);
    }
    ctx.globalAlpha = 0.75 * fade * power;
    ctx.drawImage(fx, x0 + 0, y0 - 1);
    // flames: deterministic particles that rise and shrink
    for (let k = 0; k < 14; k++) {
      const life = ((now / 600 + k * 0.137 + f.i * 0.31) % 1);
      const px = ox + Math.round(Math.sin(k * 12.9898 + f.i) * 12) + Math.round(Math.sin(life * 6 + k) * 2);
      const py = oy - Math.round(f.z) - 2 - Math.round(life * 40);
      const sz = life < 0.35 ? 3 : life < 0.7 ? 2 : 1;
      ctx.fillStyle = life < 0.5 ? col.spark : col.flame;
      ctx.fillRect(px - 1, py, sz, sz + 1);
    }
    ctx.restore();
  }
}

// 光環: a golden magic circle lying on the ground (drawn flat, so squashed to the ground's perspective), turning slowly.
// `ms` is how long it has been there, `left` the ticks it has left.
function drawHaloCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, ms: number, left: number, seed: number) {
  const grow = Math.min(1, ms / 320);
  const fade = Math.min(1, left / 45);
  const R = HALO.rx * (0.4 + 0.6 * grow);
  const squash = HALO.ry / HALO.rx;
  const t = ms / 1000;
  const pulse = 0.85 + 0.15 * Math.sin(ms / 140);
  const poly = (n: number, r: number, a0: number, skip: number) => {
    // a regular star {n/skip}
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((k * skip) / n) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  ctx.save();
  ctx.globalAlpha = fade * grow;
  ctx.translate(cx, cy);
  ctx.scale(1, squash);
  // soft golden glow on the ground
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, `rgba(255,244,190,${0.5 * pulse})`);
  g.addColorStop(0.7, `rgba(255,210,80,${0.22 * pulse})`);
  g.addColorStop(1, 'rgba(255,190,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineJoin = 'round';
  // outer and inner ring
  ctx.strokeStyle = `rgba(255,226,110,${0.95 * pulse})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.84, 0, Math.PI * 2);
  ctx.stroke();
  // rune ticks between the two rings, turning the other way
  ctx.strokeStyle = 'rgba(255,240,170,0.9)';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 16; k++) {
    const a = -t * 0.5 + (k / 16) * Math.PI * 2;
    const r0 = R * (k % 2 ? 0.87 : 0.88);
    const r1 = R * (k % 2 ? 0.96 : 0.99);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  // the hexagram and a small ring in the middle
  ctx.strokeStyle = `rgba(255,232,130,${0.95 * pulse})`;
  ctx.lineWidth = 1.2;
  poly(6, R * 0.8, t * 0.6, 2);
  poly(6, R * 0.8, t * 0.6 + Math.PI / 6, 2);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // sparkles rising out of the circle
  ctx.save();
  ctx.globalAlpha = fade * grow;
  for (let k = 0; k < 14; k++) {
    const life = (ms / 1100 + k * 0.0714 + seed * 0.13) % 1;
    const a = k * 2.4 + seed;
    const rr = R * 0.8 * (0.25 + 0.75 * ((k * 0.618) % 1));
    const px = cx + Math.round(Math.cos(a) * rr);
    const py = cy + Math.round(Math.sin(a) * rr * squash) - Math.round(life * 26);
    ctx.fillStyle = life < 0.5 ? '#ffffff' : '#ffe27a';
    ctx.fillRect(px, py, 1 + (k % 2), 2);
  }
  ctx.restore();
}

// 聖盾: the light takes the shape of a big Roman scutum held in front of the hero.
function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, ms: number, now: number, ending: boolean) {
  const grow = Math.min(1, ms / 180);
  const w = Math.max(4, Math.round(20 * grow));
  const h = Math.max(6, Math.round(38 * grow));
  const cx = Math.round(x);
  const top = y - h - 2;
  const pulse = 0.82 + 0.12 * Math.sin(now / 90);
  ctx.save();
  ctx.globalAlpha = (ending ? 0.35 + 0.5 * Math.abs(Math.sin(now / 60)) : 1) * pulse;
  const R = (c: string, rx: number, ry: number, rw: number, rh: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(cx + rx, top + ry, rw, rh);
  };
  const hw = Math.floor(w / 2);
  R('rgba(255,224,110,0.28)', -hw - 3, -3, w + 6, h + 6);
  // body with clipped corners
  R('#fff3b0', -hw + 2, 0, w - 4, h);
  R('#fff3b0', -hw, 2, w, h - 4);
  R('#f0c040', -hw + 2, 2, w - 4, h - 4);
  R('#f0c040', -hw + 1, 3, w - 2, h - 6);
  // darker inner edge and cross bands of the scutum
  R('#c08a1c', -hw + 3, 3, 1, h - 6);
  R('#c08a1c', hw - 4, 3, 1, h - 6);
  R('#d9a62c', -1, 3, 2, h - 6);
  R('#d9a62c', -hw + 3, Math.floor(h / 2) - 1, w - 6, 2);
  // central boss
  R('#fffbe0', -3, Math.floor(h / 2) - 3, 6, 6);
  R('#f0c040', -1, Math.floor(h / 2) - 1, 2, 2);
  // wing-like marks above and below the boss
  R('#fff3b0', -hw + 4, 5, w - 8, 1);
  R('#fff3b0', -hw + 4, h - 6, w - 8, 1);
  ctx.restore();
}

// 炫風斬: both arms out, a blade in each hand, spinning like a top. The ellipse is the flat circle the blades sweep; the half of
// it behind the hero is drawn before him (`front` = false) and the half in front of him after.
function drawWhirl(ctx: CanvasRenderingContext2D, ox: number, oy: number, t: number, front: boolean, blades: [number, number]) {
  const handY = -25;
  const RY = 7;
  const reach = 11 + 24;
  ctx.save();
  ctx.translate(ox, oy + handY);
  for (let i = 0; i < 2; i++) {
    const th = t * 0.55 + i * Math.PI;
    // a fading streak behind each blade
    for (let k = 0; k < 9; k++) {
      const a0 = th - (k + 1) * 0.16;
      const a1 = th - k * 0.16;
      if ((Math.sin((a0 + a1) / 2) >= 0) !== front) continue;
      ctx.strokeStyle = `rgba(210,238,255,${0.5 * (1 - k / 9)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, reach, RY, 0, a0, a1);
      ctx.stroke();
    }
    if ((Math.sin(th) >= 0) !== front) continue;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const x0 = Math.round(c * 11);
    const x1 = Math.round(c * reach);
    const y1 = Math.round(s * RY);
    ctx.strokeStyle = '#0c0c14';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = blades[i] === WID.Saber ? (s >= 0 ? '#9af4ff' : '#4ab0c0') : blades[i] === WID.Bamboo ? (s >= 0 ? '#f0dc90' : '#a89850') : s >= 0 ? '#eef4ff' : '#9aa6b4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.fillStyle = '#e0b030';
    ctx.fillRect(x0 - 1, -3, 2, 6);
  }
  if (front) {
    // the arms held straight out to both sides
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(-13, -2, 26, 5);
    ctx.fillStyle = '#e8b890';
    ctx.fillRect(-12, -1, 24, 3);
  }
  ctx.restore();
}

// 溫泉關 without its picture: a plain dusk sky, a sand strip and water.
function drawOnsenFallback(ctx: CanvasRenderingContext2D) {
  const R = (c: string, y: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, y, VW, h);
  };
  R('#c8643a', 0, 100);
  R('#4a3a5a', 100, 10);
  R('#d8a060', 110, 32);
  R('#5a3a2a', 142, 8);
  R('#2a6a7a', 150, 74);
}

// Steam drifting up from the hot spring pool at the front of the 溫泉關 picture, and a few glints on the water.
function drawOnsenSteam(ctx: CanvasRenderingContext2D, now: number) {
  ctx.save();
  for (let k = 0; k < 11; k++) {
    const p = (now / 5200 + k * 0.0909) % 1;
    const x = 18 + k * ((VW - 36) / 10) + Math.sin(now / 1800 + k * 1.7) * 6;
    const y = 222 - p * 70;
    // a soft puff: the middle is the whitest and it fades to nothing at the rim
    const r = 8 + p * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const al = Math.sin(p * Math.PI) * 0.34;
    g.addColorStop(0, `rgba(255,255,255,${al})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r * 0.6, r * 2, r * 1.2);
  }
  for (let k = 0; k < 7; k++) {
    if (Math.floor(now / 380 + k * 3) % 4 !== 0) continue;
    ctx.fillStyle = 'rgba(220,255,255,0.8)';
    ctx.fillRect(44 + ((k * 53) % 150), 204 + ((k * 7) % 14), 2, 1);
  }
  ctx.restore();
}

// The envoy is kicked into the pool: rings spread over the water and drops fly up and come down.
function drawSplash(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const x = Math.round(e.x - cam);
  const y = Math.round(e.y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = '#e8ffff';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const r = (k * 22 + i * 7) % 26;
    ctx.beginPath();
    ctx.ellipse(x, y, r + 2, (r + 2) * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rise = Math.sin(Math.min(1, k * 1.6) * Math.PI) * (16 + (i % 3) * 9);
    ctx.fillRect(Math.round(x + Math.cos(a) * (4 + k * 18)), Math.round(y - rise + Math.sin(a) * 2), 2, 2);
  }
  ctx.restore();
}

// 溫泉關's opening: what the envoy and the hero say.
function drawOnsenTalk(ctx: CanvasRenderingContext2D, snap: Snapshot) {
  const I = ONSEN.intro;
  const envoy = snap.f.find((f) => f.b & 128);
  const hero = snap.f.find((f) => DEFS[f.d]?.kind === 'player');
  if (envoy && snap.pt >= I.say1[0] && snap.pt < I.say1[1]) drawBubble(ctx, envoy.x, envoy.y - 54, '投降吧，饒你不死！');
  if (hero && snap.pt >= I.say2[0] && snap.pt < I.kick + 4) {
    const dots = Math.min(3, 1 + Math.floor((snap.pt - I.say2[0]) / 22));
    drawBubble(ctx, hero.x, hero.y - 54, '。'.repeat(dots));
  }
}

function outlined(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, fill: string, line: number) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = '#000';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

// The damage of a blow: it pops big, floats up and fades, flickering between colours. A critical hit is bigger, redder and
// flashes harder, with 爆擊 over it.
function drawDamage(ctx: CanvasRenderingContext2D, e: Fx, cam: number, age: number) {
  const crit = e.k === EV_CRIT;
  const dur = crit ? 950 : 650;
  const k = age / dur;
  const jx = ((Math.imul(Math.round(e.t0) | 0, 2654435761) >>> 0) % 17) - 8;
  const pop = Math.max(0, 1 - age / (crit ? 170 : 110));
  const base = crit ? 17 : Math.min(13, 8 + e.v / 5);
  const size = base * (1 + (crit ? 1.1 : 0.7) * pop);
  const rise = (crit ? 28 : 20) * (1 - (1 - k) * (1 - k));
  const x = Math.round(e.x - cam + jx * (crit ? 0.6 : 1));
  const y = Math.round(e.y - e.z - rise);
  const flick = Math.floor(age / (crit ? 55 : 70));
  const col = crit ? ['#ff3030', '#ffe040', '#ffffff'][flick % 3] : ['#ffffff', '#ffe060'][flick % 2];
  const font = (px: number) => `900 ${px}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.save();
  ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, (1 - k) / 0.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  outlined(ctx, String(e.v), x, y, font(size), col, crit ? 4 : 3);
  if (crit) outlined(ctx, '爆擊', x, y - size - 1, font(8), flick % 2 ? '#ffe040' : '#ff6030', 2.5);
  ctx.restore();
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, s: string, color = '#000') {
  ctx.font = 'bold 9px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const w = Math.ceil(ctx.measureText(s).width) + 10;
  const h = 15;
  const bx = Math.max(2, Math.min(VW - w - 2, Math.round(x - w / 2)));
  const by = Math.round(y - h);
  ctx.fillStyle = '#000';
  ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx, by, w, h);
  const tx = Math.max(bx + 3, Math.min(bx + w - 7, Math.round(x - 2)));
  ctx.fillStyle = '#000';
  ctx.fillRect(tx - 1, by + h, 6, 3);
  ctx.fillStyle = '#fff';
  ctx.fillRect(tx, by + h, 4, 2);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(s, bx + w / 2, by + 3);
}

// Big text over the fight: the stage title, the traitor, the pass held.
function drawBanner(ctx: CanvasRenderingContext2D, code: number, ticks: number) {
  const B = ONSEN.banner;
  const total = code === B.title ? B.titleT : code === B.cleared ? B.clearedT : B.traitorT;
  const a = Math.min(1, ticks / 30, (total - ticks) / 12 + 0.01);
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  if (code === B.title) {
    text(ctx, '溫泉關', VW / 2, 52, '#ffe060', 'center', 22);
    text(ctx, '一夫當關　萬夫莫敵', VW / 2, 80, '#ffffff', 'center', 9);
  } else if (code === B.cleared) {
    text(ctx, '關口守住了', VW / 2, 56, '#ffe060', 'center', 20);
    text(ctx, '五十名精英，無人能過', VW / 2, 82, '#ffffff', 'center', 9);
  } else {
    text(ctx, '叛徒出現！', VW / 2, 54, '#d8a0ff', 'center', 18);
    text(ctx, '小心背後', VW / 2, 78, '#ffffff', 'center', 9);
  }
  ctx.restore();
}

// 奧義 萬箭齊發: black bars slide in, and the name of the move is written large across the middle of the picture.
function drawRainTitle(ctx: CanvasRenderingContext2D, age: number) {
  const out = Math.min(1, (1900 - age) / 400);
  const bar = Math.round(26 * Math.min(1, age / 160) * out);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VW, bar);
  ctx.fillRect(0, SCREEN_H - bar, VW, bar);
  // streaks rush outwards from the middle
  ctx.globalAlpha = 0.5 * out;
  ctx.fillStyle = '#bfe4ff';
  for (let i = 0; i < 28; i++) {
    const a = i * 2.399 + 0.4;
    const r0 = 30 + ((age / 6 + i * 23) % 120);
    const len = 14 + (i % 5) * 6;
    const cx = VW / 2;
    const cy = SCREEN_H / 2;
    for (let s = 0; s < len; s += 2) ctx.fillRect(Math.round(cx + Math.cos(a) * (r0 + s) * 1.4), Math.round(cy + Math.sin(a) * (r0 + s) * 0.9), 1, 1);
  }
  // the title pops in a little oversized and settles
  const pop = 1 + 0.5 * Math.max(0, 1 - age / 200);
  ctx.globalAlpha = Math.min(1, age / 80) * out;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [s, size, y, col] of [['奧義', 22, SCREEN_H / 2 - 30, '#ffe060'], ['萬箭齊發', 40, SCREEN_H / 2 + 10, '#ffffff']] as const) {
    ctx.save();
    ctx.translate(VW / 2, y);
    ctx.scale(pop, pop);
    ctx.font = `900 ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#b01818';
    ctx.strokeText(s, 0, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(s, 0, 0);
    ctx.fillStyle = col;
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// 鬼火旋舞: the staff turns like a wheel in front of the hero; the picture has the ring, this spins bright streaks around it.
function drawStaffSpin(ctx: CanvasRenderingContext2D, ox: number, oy: number, now: number) {
  ctx.save();
  ctx.translate(ox, oy - 25);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a0 = now / 90 + (i * Math.PI * 2) / 3;
    for (const [r, w, c] of [[24, 3, 'rgba(120,235,70,0.55)'], [24, 1.5, 'rgba(235,255,190,0.95)']] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a0 + 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 霸王槍: red-and-gold streaks behind the charge, and a red wheel of cloth round the spinning spear.
function drawSpearFx(ctx: CanvasRenderingContext2D, ox: number, oy: number, face: number, thrust: boolean, t: number) {
  ctx.save();
  if (thrust) {
    for (let i = 0; i < 7; i++) {
      const y = oy - 12 - ((i * 7 + t * 3) % 24);
      const len = 14 + (i % 3) * 8;
      ctx.fillStyle = i % 2 ? 'rgba(224,40,40,0.75)' : 'rgba(255,214,90,0.8)';
      ctx.fillRect(face > 0 ? ox - 8 - len : ox + 8, Math.round(y), len, 1);
    }
  } else {
    ctx.translate(ox, oy - 24);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = t * 0.7 + (i * Math.PI * 2) / 3;
      for (const [w, c] of [[4, 'rgba(210,30,30,0.6)'], [1.5, 'rgba(255,214,90,0.95)']] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(0, 0, 30, a0 - 0.8, a0);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// 鬼火: green flames licking up the body of what the naginata has set alight.
function drawBurn(ctx: CanvasRenderingContext2D, ox: number, oy: number, now: number, seed: number) {
  ctx.save();
  for (let k = 0; k < 9; k++) {
    const life = (now / 520 + k * 0.111 + seed * 0.17) % 1;
    const px = ox + Math.round(Math.sin(k * 5.3 + seed) * 8);
    const py = oy - 4 - Math.round(life * 34);
    const sz = life < 0.4 ? 3 : life < 0.75 ? 2 : 1;
    ctx.globalAlpha = 1 - life * 0.6;
    ctx.fillStyle = life < 0.5 ? '#d2ff96' : '#82e646';
    ctx.fillRect(px - 1, py, sz, sz + 1);
    ctx.fillStyle = '#3c9a38';
    ctx.fillRect(px, py + sz, 1, 1);
  }
  ctx.restore();
}

// 雷切: a small lightning that jumps down onto an enemy.
function drawZap(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const x = Math.round(e.x - cam);
  const y = Math.round(e.y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 6; i++) pts.push([x + (i % 2 ? 4 : -4) * (i > 0 && i < 6 ? 1 : 0) + Math.round(Math.sin(e.t0 + i) * 2), y - 44 + i * 6]);
  ctx.lineJoin = 'round';
  for (const [w, c] of [[4, 'rgba(120,190,255,0.5)'], [2, '#ffffff']] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  ctx.restore();
}

// 金光覺醒: a golden ring of light spreading from the hero.
function drawAwaken(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const x = Math.round(e.x - cam);
  const y = Math.round(e.y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.strokeStyle = '#ffe070';
  ctx.lineWidth = 3;
  for (let i = 0; i < 2; i++) {
    const r = (k * 70 + i * 16) % 80;
    ctx.beginPath();
    ctx.ellipse(x, y, r + 6, (r + 6) * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff6b0';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * (6 + k * 60)), Math.round(y - 12 - k * 28 + Math.sin(a) * 6), 2, 2);
  }
  ctx.restore();
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
  if (f.s === St.Down && f.z > 0) return { weapon: 0, anim: 'fly', t: f.t };
  if (f.s === St.Beam) return { weapon: 0, anim: f.t >= BEAM.charge + BEAM.fire ? 'beamend' : 'beam', t: f.t };
  if (f.s === St.Barrage) return { weapon: 0, anim: 'punch', t: f.t % 12 };
  if (f.s === St.Tatsu) return { weapon: 0, anim: 'kick', t: 7 };
  if (f.s === St.Charge) return { weapon: 0, anim: 'beam', t: f.t % 24 };
  if (f.s === St.Whirl) return hasArt ? { weapon: 0, anim: 'whirl', t: f.t } : { weapon: 0, anim: 'idle', t: 0 };
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
function weaponGfx(ctx: CanvasRenderingContext2D, kind: number, heat = 0, spin = 0) {
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
    case WID.Spear:
      // 霸王槍: a long wooden shaft, a grey spearhead, and the big red cloth tied under the head
      R('#5a3a1c', -12, -1, 46, 3);
      R('#8a5a2a', -12, -1, 46, 1);
      R('#a8aeb8', 34, -3, 7, 7);
      R('#e4e9f2', 34, -3, 7, 2);
      R('#e4e9f2', 41, -2, 4, 5);
      R('#f6f8fc', 45, -1, 3, 3);
      R('#b01010', 29, -3, 6, 10);
      R('#e02828', 30, -3, 3, 8);
      R('#8a0a0a', 32, 3, 4, 9);
      R('#e02828', 28, 5, 3, 6);
      break;
    case WID.Twin:
      // one of the two blades: a long steel blade with a gold guard and a red grip
      R('#6a1c1c', -5, -1, 7, 3);
      R('#e0b030', 2, -3, 2, 7);
      R('#9aa6b4', 4, -1, 25, 3);
      R('#e6eef8', 4, -1, 25, 1);
      R('#ffffff', 6, -1, 20, 1);
      R('#cfd8e4', 29, -1, 2, 2);
      break;
    case WID.Gatling: {
      // heat: 0..500 (501+ = jammed). The barrels start to glow at 300 and are white-red at the limit.
      const k = Math.max(0, Math.min(1, (heat - GATLING.red) / (GATLING.overheat - GATLING.red)));
      const glow = heat > GATLING.overheat ? 1 : k;
      const barrel = glow > 0 ? `rgb(${Math.round(70 + 185 * glow)},${Math.round(70 - 40 * glow)},${Math.round(80 - 60 * glow)})` : '#4c4c56';
      R('#6a3c18', -9, -1, 8, 5);
      R('#2c2c32', -2, -3, 14, 7);
      R('#4c4c56', -2, -3, 14, 1);
      R('#3a5a2a', 3, 4, 9, 6);
      R('#26401c', 3, 4, 9, 1);
      R('#2c2c32', 11, -4, 3, 9);
      // six barrels seen from the side: alternate stripes turn while it fires
      R('#1c1c22', 14, -4, 17, 9);
      for (let i = 0; i < 4; i++) R(i === ((spin >> 1) & 3) ? '#8a8a96' : barrel, 14, -4 + i * 2 + 1, 17, 1);
      R(barrel, 14, -3, 17, 2);
      R(barrel, 14, 0, 17, 2);
      R(barrel, 14, 3, 17, 1);
      R('#1c1c22', 29, -4, 3, 9);
      if (glow > 0) {
        ctx.fillStyle = `rgba(255,${Math.round(120 - 80 * glow)},40,${0.15 + 0.3 * glow})`;
        ctx.fillRect(12, -6, 21, 13);
      }
      R('#2c2c32', -1, -5, 6, 2);
      break;
    }
    default:
      break;
  }
}

function drawWeaponInHand(ctx: CanvasRenderingContext2D, f: SnapFighter) {
  const k = f.w;
  if (!k || k === WID.Stick) return;
  if (f.s === St.Down || f.s === St.Dead || f.s === St.Held || f.s === St.Hurt || f.s === St.Beam || f.s === St.Whirl) return;
  const wd = WEAPONS[k];
  ctx.save();
  if (k === WID.Twin || f.w2) {
    // a blade in each hand: the back one is a touch behind the front one while swinging, and tilted the other way when resting
    const p = f.s === St.Swing ? Math.min(1, f.t / (wd.atk.start + wd.atk.active + 2)) : -1;
    for (const back of [true, false]) {
      const kind = back && f.w2 ? f.w2 : k;
      ctx.save();
      ctx.translate(back ? -3 : 10, back ? -22 : -21);
      if (p >= 0) ctx.rotate(-1.9 + Math.min(1, Math.max(0, p * (back ? 0.85 : 1))) * 2.5 + (back ? -0.25 : 0));
      else ctx.rotate(-Math.PI / 2 + (back ? -0.35 : 0.12));
      weaponGfx(ctx, kind);
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  if (k === WID.Spear && (f.s === St.Swing || f.s === St.Thrust)) {
    // the spear is stabbed straight ahead, not swung round
    const p = f.s === St.Swing ? Math.sin(Math.min(1, f.t / (wd.atk.start + wd.atk.active + 2)) * Math.PI) : (f.t % 8 < 4 ? 0.2 : 1);
    ctx.translate(2 + p * 16, -22);
    weaponGfx(ctx, k);
  } else if (k === WID.Spear && f.s === St.Flourish) {
    ctx.translate(0, -24);
    ctx.rotate(f.t * 0.7);
    weaponGfx(ctx, k);
  } else if (f.s === St.Swing) {
    const p = Math.min(1, f.t / (wd.atk.start + wd.atk.active + 2));
    ctx.translate(9, -22);
    ctx.rotate(-1.9 + p * 2.5);
    weaponGfx(ctx, k);
  } else if (f.s === St.Shoot) {
    ctx.translate(9, -22);
    ctx.rotate(-0.05);
    weaponGfx(ctx, k, f.ht, f.t);
    if (k === WID.Gatling && f.ht <= GATLING.overheat) {
      if (f.t % 3 !== 0) {
        ctx.fillStyle = '#fff2a0';
        ctx.fillRect(32, -4, 7, 8);
        ctx.fillStyle = '#ff9a30';
        ctx.fillRect(36, -2, 7, 4);
      }
    } else if (f.t >= 2 && f.t <= 5) {
      ctx.fillStyle = '#fff2a0';
      ctx.fillRect(25, -4, 6, 7);
      ctx.fillStyle = '#ff9a30';
      ctx.fillRect(28, -2, 6, 3);
    }
  } else if (k === WID.Stone) {
    ctx.translate(-4, -49);
    weaponGfx(ctx, k);
  } else if (k === WID.Rifle || k === WID.Gatling) {
    ctx.translate(8, -21);
    ctx.rotate(-0.08);
    weaponGfx(ctx, k, f.ht);
  } else {
    ctx.translate(11, -19);
    ctx.rotate(-Math.PI / 2 + 0.1);
    weaponGfx(ctx, k);
  }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, it: SnapItem, cam: number, now: number, assets: Assets) {
  const sx = Math.round(it.x - cam);
  const sy = Math.round(it.y);
  shadow(ctx, sx, sy, it.z, 7);
  if (it.k === ITEM_1UP) {
    draw1Up(ctx, sx, sy - Math.round(it.z), now);
    return;
  }
  if (it.k === ITEM_TONIC) {
    drawTonic(ctx, sx, sy - Math.round(it.z), now);
    return;
  }
  const icon = assets.icon(it.k);
  if (icon) {
    // the divine weapons lie on the ground with a glint now and then
    ctx.save();
    ctx.translate(sx, sy - 4 - Math.round(it.z));
    if (it.k === WID.Bow) ctx.rotate(Math.PI / 2);
    ctx.drawImage(icon, -Math.floor(icon.width / 2), -Math.floor(icon.height / 2));
    ctx.restore();
    if (Math.floor(now / 260) % 4 === 0) {
      ctx.fillStyle = '#ffffff';
      const gx = sx - 8 + ((it.i * 7) % 16);
      ctx.fillRect(gx, sy - 9 - Math.round(it.z), 1, 3);
      ctx.fillRect(gx - 1, sy - 8 - Math.round(it.z), 3, 1);
    }
    return;
  }
  ctx.save();
  ctx.translate(sx - (it.k === WID.Stone ? 6 : 10), sy - 3 - Math.round(it.z));
  weaponGfx(ctx, it.k);
  if (it.k === WID.Twin) {
    ctx.translate(1, -4);
    weaponGfx(ctx, it.k);
  }
  ctx.restore();
}

// 1UP: a green mushroom-like badge that bobs and glints.
function draw1Up(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const bob = Math.round(Math.sin(now / 160) * 2);
  const R = (c: string, rx: number, ry: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + rx, y - 14 + bob + ry, w, h);
  };
  R('#101010', -8, 0, 16, 14);
  R('#e8e0c8', -6, 7, 12, 6);
  R('#30c030', -7, 1, 14, 7);
  R('#a0ff90', -5, 2, 4, 2);
  R('#ffffff', 1, 3, 4, 3);
  R('#101010', -2, 9, 1, 2);
  R('#101010', 1, 9, 1, 2);
  if (Math.floor(now / 200) % 2 === 0) {
    R('#ffffff', 7, -2, 1, 5);
    R('#ffffff', 5, 0, 5, 1);
  }
  text(ctx, '1UP', x, y - 25 + bob, '#7dff7d', 'center', 7);
}

// Tonic: a bottle, red (health) on one side and blue (mana) on the other, with a glint.
function drawTonic(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const bob = Math.round(Math.sin(now / 190) * 1.5);
  const R = (c: string, rx: number, ry: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + rx, y - 14 + bob + ry, w, h);
  };
  R('#101010', -2, 0, 5, 3);
  R('#c8a060', -1, 0, 3, 2);
  R('#101010', -6, 3, 13, 12);
  R('#d8e8f0', -5, 4, 11, 10);
  R('#e03a3a', -5, 8, 5, 6);
  R('#3a8aff', 0, 8, 6, 6);
  R('#ffffff', -4, 5, 2, 3);
  if (Math.floor(now / 220) % 2 === 0) {
    R('#ffffff', 7, -1, 1, 5);
    R('#ffffff', 5, 1, 5, 1);
  }
}

function drawShot(ctx: CanvasRenderingContext2D, s: { k: number; x: number; y: number; z: number; r: 1 | -1; a?: number }, cam: number, now: number, assets: Assets) {
  const sx = Math.round(s.x - cam);
  const sy = Math.round(s.y - s.z);
  if (s.k === 4) {
    // 靈氣箭: the golden arrow, turned the way it is flying, with a teal glow behind it
    const a = s.a ?? (s.r > 0 ? 0 : Math.PI);
    const icon = assets.icon('arrow');
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(80,220,210,0.35)';
    ctx.fillRect(-18, -1, 14, 2);
    if (icon) ctx.drawImage(icon, -Math.floor(icon.width * 0.7), -Math.floor(icon.height / 2));
    else {
      ctx.fillStyle = '#ffd060';
      ctx.fillRect(-12, -1, 14, 2);
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(2, -2, 4, 4);
    }
    ctx.restore();
    return;
  }
  if (s.k === 3) {
    ctx.fillStyle = 'rgba(255,190,70,0.5)';
    ctx.fillRect(s.r > 0 ? sx - 12 : sx + 4, sy, 9, 1);
    ctx.fillStyle = '#fffbd0';
    ctx.fillRect(s.r > 0 ? sx - 5 : sx, sy, 6, 1);
    return;
  }
  if (s.k === 2) {
    const cross = Math.floor(now / 45) % 2 === 0;
    ctx.fillStyle = '#10101a';
    if (cross) {
      ctx.fillRect(sx - 3, sy - 1, 7, 3);
      ctx.fillRect(sx - 1, sy - 3, 3, 7);
    } else {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(sx + i - 1, sy + i - 1, 3, 3);
        ctx.fillRect(sx + i - 1, sy - i - 1, 3, 3);
      }
    }
    ctx.fillStyle = '#dfe4ee';
    if (cross) {
      ctx.fillRect(sx - 2, sy, 5, 1);
      ctx.fillRect(sx, sy - 2, 1, 5);
    } else {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(sx + i, sy + i, 1, 1);
        ctx.fillRect(sx + i, sy - i, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(223,228,238,0.35)';
    ctx.fillRect(s.r > 0 ? sx - 10 : sx + 5, sy, 6, 1);
    return;
  }
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

// 天雷萬鈞: a jagged bolt from the top of the screen down to the strike, then a burst on the ground.
function drawBolt(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const x = Math.round(e.x - cam);
  const y = Math.round(e.y);
  let seed = Math.floor(e.x * 7 + e.y * 13 + e.t0) % 9973;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pts: [number, number][] = [[x + (rnd() - 0.5) * 24, -4]];
  const steps = 9;
  for (let i = 1; i < steps; i++) pts.push([x + (rnd() - 0.5) * 22 * (1 - i / steps) , (y * i) / steps]);
  pts.push([x, y]);
  const a = Math.max(0, 1 - k);
  ctx.lineJoin = 'round';
  for (const [w, c] of [
    [6, `rgba(120,110,255,${0.25 * a})`],
    [3, `rgba(190,200,255,${0.6 * a})`],
    [1, `rgba(255,255,255,${a})`],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(210,220,255,${0.5 * a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 5 + 12 * k, 2 + 4 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

// 龍捲風腳: translucent wind rings around the spinning body (`back` = the half behind it).
function drawTornado(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, back: boolean) {
  for (let i = 0; i < 3; i++) {
    const yy = y - 6 - i * 11;
    const rx = 15 + i * 3;
    const ph = t * 0.55 + i * 1.7;
    ctx.strokeStyle = `rgba(235,248,255,${0.55 - i * 0.1})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, yy, rx, 3.5, 0, ph + (back ? Math.PI : 0), ph + (back ? Math.PI * 2 : Math.PI));
    ctx.stroke();
  }
  if (!back) {
    ctx.fillStyle = 'rgba(210,235,255,0.5)';
    for (let i = 0; i < 4; i++) {
      const a = t * 0.7 + i * 1.6;
      ctx.fillRect(Math.round(x + Math.cos(a) * 17), Math.round(y - 4 - ((t * 2 + i * 9) % 34)), 2, 2);
    }
  }
}

// 百裂拳: a cloud of fists flying out in front of the hero, with speed lines.
function drawBarrage(ctx: CanvasRenderingContext2D, x: number, y: number, r: 1 | -1, t: number) {
  for (let i = 0; i < 6; i++) {
    const ph = (t * 3 + i * 7) % 20;
    const fx = x + r * (12 + ph);
    const fy = y - 30 + ((i * 17 + t * 5) % 22);
    const a = 1 - ph / 26;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`;
    ctx.fillRect(r > 0 ? fx - 12 : fx + 4, fy + 1, 9, 1);
    ctx.fillStyle = '#101010';
    ctx.beginPath();
    ctx.arc(fx, fy, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0c090';
    ctx.beginPath();
    ctx.arc(fx, fy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Steam puffs from a jammed gatling.
function drawSteam(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  for (let i = 0; i < 4; i++) {
    const p = ((now / 600 + i / 4) % 1);
    ctx.fillStyle = `rgba(230,230,235,${0.55 * (1 - p)})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(p * 6 + i) * 3, y - p * 22, 2 + p * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpark(ctx: CanvasRenderingContext2D, e: Fx, cam: number, k: number) {
  const cx = e.x - cam;
  const cy = e.y - e.z;
  const len = (e.k ? 9 : 6) * (0.5 + k);
  ctx.strokeStyle = e.k === 3 ? '#fff0a0' : e.k === 2 ? '#c8c8d0' : e.k ? '#ffe060' : '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    ctx.moveTo(cx + Math.cos(a) * len * 0.35, cy + Math.sin(a) * len * 0.35);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
  }
  ctx.stroke();
}

// The stage runs from midday to dusk: the background is multiplied with a colour that follows the camera.
const TIME_OF_DAY: [number, number[]][] = [
  [0, [255, 255, 255]],
  [0.4, [255, 248, 232]],
  [0.65, [255, 214, 170]],
  [0.85, [236, 150, 140]],
  [1, [150, 118, 190]],
];

function tintForTime(ctx: CanvasRenderingContext2D, cam: number) {
  const t = Math.max(0, Math.min(1, cam / (STAGE_W - VW)));
  let i = 1;
  while (i < TIME_OF_DAY.length - 1 && t > TIME_OF_DAY[i][0]) i++;
  const [t0, c0] = TIME_OF_DAY[i - 1];
  const [t1, c1] = TIME_OF_DAY[i];
  const k = (t - t0) / (t1 - t0);
  const c = c0.map((v, n) => Math.round(v + (c1[n] - v) * k));
  if (c[0] === 255 && c[1] === 255 && c[2] === 255) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.fillRect(0, 0, VW, SCREEN_H);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, cam: number) {
  const R = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), y, w, h);
  };
  R('#7ec4e8', 0, 0, VW, 72);
  for (let i = 0; i < 5; i++) {
    const cx = ((((i * 120 - cam * 0.25) % 360) + 360) % 360) - 60;
    R('#ffffff', cx, 14 + (i % 3) * 9, 36, 7);
    R('#ffffff', cx + 8, 10 + (i % 3) * 9, 22, 5);
  }
  const first = Math.floor(cam / BW);
  const last = Math.floor((cam + VW) / BW);
  for (let i = first; i <= last; i++) drawBuilding(ctx, i * BW - cam, Math.abs(i) % 4);

  R('#d99a3a', 0, HORIZON, VW, SCREEN_H - HORIZON);
  R('#a8742a', 0, HORIZON, VW, 3);
  for (const y of [148, 168, 192, 218]) R('#cf8f33', 0, y, VW, 1);
  for (let i = 0; i < 26; i++) {
    const x = ((((i * 53 - cam) % VW) + VW) % VW) | 0;
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

function energyBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, e: number, now: number, gold = false) {
  const k = Math.max(0, Math.min(1, e / MP_MAX));
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = '#10243e';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = k >= 1 && Math.floor(now / 110) % 2 === 0 ? '#ffffff' : gold ? '#ffd23a' : '#38c8ff';
  ctx.fillRect(x, y, Math.round(w * k), 3);
}

const PIP_COLORS = ['#3fd07a', '#ff9a3c', '#fff08a', '#ffd23c', '#7fd0ff', '#ff6bd6'];

function drawHud(ctx: CanvasRenderingContext2D, snap: Snapshot, o: DrawOpts) {
  snap.sl.forEach((s, i) => {
    if (!s.a) return;
    const f = snap.f.find((q) => q.i === s.f);
    const left = i === 0;
    // the bars grow with the health and mana caps (70px per 100), up to a limit so two players still fit
    const hpW = f ? Math.min(HUD_BAR_MAX, Math.round(f.m * 0.7)) : 70;
    const mpW = f ? Math.min(HUD_BAR_MAX, Math.round(f.em * 0.7)) : 70;
    const x = left ? 8 : VW - 8 - Math.max(70, hpW, mpW);
    const name = DEFS[f?.d ?? ''] ? DEFS[f!.d].name : `P${i + 1}`;
    text(ctx, name + (i === o.mySlot ? ' ◀' : ''), x, 3);
    bar(ctx, x, 14, hpW, f ? f.h : 0, f ? f.m : 1);
    energyBar(ctx, x, 21, mpW, f ? f.e : 0, o.now, !!f && (f.b & 515) !== 0);
    if (f) {
      // one pip per special: lit = ready, dark = cooling down
      SPECIALS.forEach((sp, n) => {
        const px = x + hpW - (SPECIALS.length - n) * 7 + 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(px - 1, 3, 6, 6);
        ctx.fillStyle = f.k[n] > 0 ? '#30303c' : PIP_COLORS[n];
        ctx.fillRect(px, 4, 4, 4);
      });
    }
    text(ctx, `x${Math.max(0, s.l)}  ${String(s.p).padStart(6, '0')}`, x, 26, '#ffd070');
    if (f && f.w) {
      const wd = WEAPONS[f.w];
      const jammed = f.w === WID.Gatling && f.ht > GATLING.overheat;
      const hot = f.w === WID.Gatling && f.ht >= GATLING.red;
      const state = jammed ? `　過熱 ${f.ht - GATLING.overheat}s` : '';
      const wd2 = f.w2 ? WEAPONS[f.w2] : undefined;
      const pair = wd2 ? ` + ${wd2.name} ${f.n2}` : '';
      text(ctx, `${wd.name}${wd.uses < UNLIMITED ? ` ${f.n}` : ''}${pair}${state}`, x, 35, jammed ? '#ff6a4a' : hot ? '#ffb070' : '#bfe8ff');
    }
  });

  if (snap.sg === 1 && snap.ph >= 1) {
    text(ctx, `溫泉關　擊倒 ${Math.min(snap.kl, ONSEN.total)} / ${ONSEN.total}`, VW / 2, 3, '#ffe060', 'center');
    const traitor = snap.f.find((f) => f.b & 64 && f.s !== St.Dead);
    if (traitor) {
      text(ctx, '叛徒', VW / 2 - 58, 12, '#d8a0ff', 'left', 7);
      bar(ctx, VW / 2 - 40, 14, 80, traitor.h, traitor.m);
    }
  }

  const boss = snap.f.find((f) => DEFS[f.d]?.kind === 'boss' && f.s !== St.Dead);
  if (boss) {
    text(ctx, `${DEFS[boss.d].name} Lv.${snap.lp + 1}`, VW / 2, 3, '#ff9090', 'center');
    bar(ctx, VW / 2 - 40, 14, 80, boss.h, boss.m);
  }
  if (snap.lp > 0) text(ctx, `第 ${snap.lp + 1} 周　怪 Lv.${snap.lp + 1}`, VW / 2, 24, '#ffe060', 'center', 7);

  if (snap.s === 0 && snap.lk === 0 && snap.wv < snap.wt && Math.floor(o.now / 400) % 2 === 0) {
    text(ctx, 'GO ▶', VW - 12, 96, '#fff', 'right', 14);
  }
  if (snap.s === 2) {
    text(ctx, 'GAME OVER', VW / 2, 92, '#ff6060', 'center', 20);
  }
  if (o.hint) text(ctx, o.hint, VW / 2, SCREEN_H - 12, '#ffffff', 'center');
}
