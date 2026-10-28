// Sound effects made on the spot (no files): blows, swings, shots, lightning, the bow's rain of arrows. Two sources:
// the events the simulation sends (a hit, a crit, a bolt, 萬箭齊發) and the fighters' own states (a punch begins, the bow is drawn).
import { BEAM } from '../shared/specials';
import { BOW } from '../shared/weapons';
import { EV_AWAKEN, EV_CRIT, EV_RAIN, EV_UP, EV_ZAP } from '../shared/feel';
import { St, type GameEvent, type Snapshot } from '../shared/types';

type Wave = OscillatorType;
type Audio = { ctx: AudioContext; out: GainNode } | null;

export class Sfx {
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private seen = new Map<number, { s: number; t: number; b: number }>();
  private lastHit = 0;
  private recent: number[] = [];
  private ctx: AudioContext | null = null;

  constructor(private audio: () => Audio, private muted: () => boolean) {}

  private ready(): AudioContext | null {
    const a = this.audio();
    if (!a || a.ctx.state !== 'running' || this.muted()) return null;
    if (this.ctx !== a.ctx) {
      this.ctx = a.ctx;
      this.bus = a.ctx.createGain();
      this.bus.gain.value = 0.7;
      // loud ones (thunder, the arrow rain) are held back instead of clipping
      const lim = a.ctx.createDynamicsCompressor();
      lim.threshold.value = -14;
      lim.knee.value = 6;
      lim.ratio.value = 12;
      lim.attack.value = 0.002;
      lim.release.value = 0.15;
      this.bus.connect(lim).connect(a.out);
      const n = a.ctx.sampleRate;
      this.noise = a.ctx.createBuffer(1, n, a.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return a.ctx;
  }

  /** Too many at once turns to mush: at most a dozen new sounds within a tenth of a second. */
  private room(now: number): boolean {
    this.recent = this.recent.filter((t) => now - t < 100);
    if (this.recent.length >= 12) return false;
    this.recent.push(now);
    return true;
  }

  private tone(c: AudioContext, f0: number, f1: number, dur: number, vol: number, type: Wave = 'sine', delay = 0) {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(c: AudioContext, kind: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, delay = 0) {
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = kind;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl).connect(g).connect(this.bus!);
    s.start(t, Math.random() * 0.6);
    s.stop(t + dur + 0.02);
  }

  events(evs: GameEvent[], now: number) {
    if (!evs.length) return;
    const c = this.ready();
    if (!c) return;
    for (const e of evs) {
      const k = e[3];
      const j = 0.9 + Math.random() * 0.2;
      if (k === EV_RAIN) this.rain(c);
      else if (k === EV_AWAKEN) this.awaken(c);
      else if (k === EV_UP) this.oneUp(c);
      else if (k === EV_ZAP) this.zap(c);
      else if (k === 4) this.thunder(c);
      else if (k === 5) this.hiss(c, 'lowpass', 1400, 250, 0.5, 0.6);
      else if (k === EV_CRIT) {
        // the blow itself comes with its own spark event; the crit adds a ring on top
        this.tone(c, 1500 * j, 700, 0.14, 0.3, 'triangle');
        this.hiss(c, 'highpass', 4500, 3000, 0.07, 0.35);
      } else if (k === 0 || k === 1 || k === 3 || k === 2) {
        // a rapid hail of hits (the arrow rain) only gets one sound every 35 ms
        if (now - this.lastHit < 35 || !this.room(now)) continue;
        this.lastHit = now;
        if (k === 0) {
          this.hiss(c, 'bandpass', 1400 * j, 450, 0.08, 0.75, 1.2);
          this.tone(c, 190 * j, 85, 0.1, 0.8);
        } else if (k === 1) {
          this.hiss(c, 'lowpass', 1100 * j, 160, 0.18, 0.75);
          this.tone(c, 130 * j, 38, 0.24, 0.9);
        } else if (k === 3) {
          this.tone(c, 950 * j, 720, 0.12, 0.3, 'square');
          this.hiss(c, 'bandpass', 3200, 2400, 0.08, 0.4, 3);
        } else this.tone(c, 1900, 1900, 0.05, 0.2, 'triangle');
      }
    }
  }

  /** Looks at every fighter's state: a swing, a shot, a jump, a power-up each have a sound when they begin. */
  scan(snap: Snapshot | null, now: number) {
    if (!snap) {
      this.seen.clear();
      return;
    }
    const c = this.ready();
    const live = new Set<number>();
    for (const f of snap.f) {
      live.add(f.i);
      const was = this.seen.get(f.i);
      this.seen.set(f.i, { s: f.s, t: f.t, b: f.b });
      if (!was || !c) continue;
      const entered = f.s !== was.s;
      const crossed = (n: number) => !entered && was.t < n && f.t >= n;
      const wow = () => this.room(now);
      if (entered) {
        if ((f.s === St.Punch || f.s === St.Kick || f.s === St.AirKick || f.s === St.Upper || f.s === St.Dash || f.s === St.Swing || f.s === St.HoldSwing || f.s === St.Throw) && wow()) {
          const blade = f.s === St.Swing && f.w > 0;
          this.hiss(c, 'bandpass', blade ? 900 : 500, blade ? 3200 : 1800, blade ? 0.14 : 0.1, blade ? 0.32 : 0.22, 1);
        } else if (f.s === St.Jump && was.s !== St.Jump && f.z > 0 && wow()) this.tone(c, 240, 520, 0.1, 0.14);
        else if (f.s === St.Land && wow()) this.hiss(c, 'lowpass', 500, 150, 0.07, 0.25);
        else if (f.s === St.Pick && wow()) {
          this.tone(c, 660, 660, 0.07, 0.2, 'triangle');
          this.tone(c, 990, 990, 0.1, 0.2, 'triangle', 0.07);
        } else if (f.s === St.Beam) this.tone(c, 90, 420, BEAM.charge / 60, 0.25, 'sawtooth');
        else if (f.s === St.Charge) this.tone(c, 55, 220, 1.6, 0.3, 'sawtooth');
        else if (f.s === St.Tatsu || f.s === St.Whirl || f.s === St.Staff || f.s === St.Barrage || f.s === St.Thrust || f.s === St.Flourish) this.hiss(c, 'bandpass', 500, 2200, 0.16, 0.3, 1);
      } else {
        // moves that go on for a while keep whooshing
        const every = f.s === St.Barrage ? 6 : f.s === St.Tatsu ? 9 : f.s === St.Whirl ? 10 : f.s === St.Staff ? 7 : f.s === St.Thrust ? 5 : f.s === St.Flourish ? 6 : 0;
        if (every && Math.floor(f.t / every) > Math.floor(was.t / every) && wow()) this.hiss(c, 'bandpass', 600, 2400, 0.1, 0.22, 1);
      }
      if (f.s === St.Beam && crossed(BEAM.charge)) {
        this.hiss(c, 'bandpass', 500, 300, 0.7, 0.6, 0.8);
        this.tone(c, 75, 45, 0.6, 0.7);
      }
      if (f.s === St.Shoot) {
        if (f.w === 8 && crossed(BOW.draw)) {
          this.tone(c, 560, 230, 0.2, 0.28, 'triangle');
          this.hiss(c, 'bandpass', 2600, 1400, 0.06, 0.25, 2);
        } else if (f.w === 6) {
          if (Math.floor((f.t - 1) / 3) > Math.floor((was.t - 1) / 3) || entered) {
            if (wow()) {
              this.hiss(c, 'lowpass', 3200, 500, 0.06, 0.45);
              this.tone(c, 200, 70, 0.07, 0.35);
            }
          }
        } else if (f.w === 5 && (crossed(2) || (entered && f.t >= 2))) {
          this.hiss(c, 'lowpass', 3500, 400, 0.11, 0.6);
          this.tone(c, 220, 60, 0.12, 0.5);
        } else if (f.w === 0 && crossed(3)) this.hiss(c, 'bandpass', 1500, 3500, 0.08, 0.2, 2);
      }
      // power-ups that have just been switched on: 光環 4, 爆氣 1, 聖盾 2
      const gained = f.b & ~was.b;
      if (gained & 7) this.tone(c, 330, 880, 0.45, 0.22, 'triangle');
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id);
  }

  private zap(c: AudioContext) {
    this.tone(c, 1500, 180, 0.13, 0.3, 'sawtooth');
    for (let i = 0; i < 4; i++) this.hiss(c, 'highpass', 3500, 2500, 0.03, 0.4, 1, i * 0.03);
  }

  private thunder(c: AudioContext) {
    this.hiss(c, 'highpass', 5000, 2000, 0.05, 0.8);
    this.hiss(c, 'lowpass', 2200, 90, 1.0, 0.9);
    this.tone(c, 70, 28, 0.7, 0.8);
  }

  private awaken(c: AudioContext) {
    for (const [i, f] of [220, 330, 440, 660].entries()) this.tone(c, f * 0.8, f * 1.5, 1.1, 0.16, 'triangle', i * 0.06);
    this.tone(c, 90, 30, 0.8, 0.9);
    this.hiss(c, 'bandpass', 400, 4000, 1.0, 0.4, 0.7);
  }

  /** The banana's 1UP: a bright run of notes going up, with a soft chime on the end. */
  private oneUp(c: AudioContext) {
    for (const [i, f] of [660, 784, 988, 1319, 1568].entries()) this.tone(c, f, f, 0.16, 0.22, 'square', i * 0.07);
    this.tone(c, 2637, 2637, 0.5, 0.12, 'sine', 0.36);
  }

  /** 萬箭齊發: a gong, a drum and a second of arrows rushing out. */
  private rain(c: AudioContext) {
    this.tone(c, 110, 38, 0.5, 1);
    for (const f of [110, 165, 221, 331]) this.tone(c, f, f * 0.98, 2.0, 0.14, 'sine');
    this.hiss(c, 'bandpass', 300, 3600, 1.1, 0.55, 0.8);
    this.hiss(c, 'highpass', 6000, 3000, 0.08, 0.8);
  }
}
