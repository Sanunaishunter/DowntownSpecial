// Background music: looping tracks from /assets/music/<name>.mp3 (or .ogg), cross-faded when the scene changes.
// A scene lists the names it would like, best first, and gets the first file that exists; with no file at all the tune of the
// first name is played from the synthesizer (synth.ts), so there is always music.
import { Synth, TUNES } from './synth';

const LEVEL = 0.55;
const FADE = 1.2;

interface Playing {
  key: string;
  gain: GainNode;
  stop: (t: number) => void;
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private cur: Playing | null = null;
  private want = '';
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('eb-mute') === '1';
    } catch {
      /* private mode: keep the default */
    }
    // a browser only lets sound start after a tap or key press
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (!this.muted) void this.ctx.resume();
    });
  }

  private unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : LEVEL;
      this.master.connect(this.ctx.destination);
      const want = this.want;
      this.want = '';
      if (want) this.play(want.split('|'));
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  /** The audio context and the volume node everything goes through (muting is done there), once the first tap has unlocked sound. */
  node(): { ctx: AudioContext; out: GainNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, out: this.master } : null;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('eb-mute', m ? '1' : '0');
    } catch {
      /* not saved */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : LEVEL, this.ctx.currentTime, 0.08);
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      p = (async () => {
        for (const ext of ['mp3', 'ogg']) {
          try {
            const r = await fetch(`/assets/music/${name}.${ext}`);
            if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('audio')) continue;
            return await this.ctx!.decodeAudioData(await r.arrayBuffer());
          } catch {
            /* try the next one */
          }
        }
        return null;
      })();
      this.buffers.set(name, p);
    }
    return p;
  }

  /** Play the first of these tracks that exists; nothing changes while the same wish is already playing. */
  play(names: string[]) {
    const key = names.join('|');
    if (key === this.want) return;
    this.want = key;
    if (!this.ctx || !this.master) return; // starts once the first tap unlocks the sound
    void (async () => {
      let name = '';
      let buf: AudioBuffer | null = null;
      for (const n of names) {
        buf = await this.load(n);
        if (buf) {
          name = n;
          break;
        }
      }
      if (this.want !== key || !this.ctx || !this.master) return;
      if (!buf) name = `synth:${names[0]}`;
      if (this.cur?.key === name) return;
      this.swap(name, buf, names[0]);
    })();
  }

  private swap(name: string, buf: AudioBuffer | null, scene: string) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const old = this.cur;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + FADE);
      old.stop(t + FADE + 0.05);
    }
    this.cur = null;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    gain.connect(this.master!);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
      this.cur = { key: name, gain, stop: (at) => src.stop(at) };
    } else if (TUNES[scene]) {
      const synth = new Synth(ctx, TUNES[scene], gain);
      this.cur = { key: name, gain, stop: () => window.setTimeout(() => synth.stop(), FADE * 1000 + 50) };
    }
  }
}
