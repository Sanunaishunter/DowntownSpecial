// Background music made on the spot, for when there is no file in assets/music: the shamisen and the koto are plucked strings
// (a Karplus-Strong string), the taiko is a pitch-dropping thump, the shakuhachi a breathy tone. The notes are the In scale
// (D, E-flat, G, A, B-flat), which is what makes it sound Japanese; every track is a short loop of 16-step bars.

// Notes in a bar are written one character per sixteenth: a digit 0-4 is a degree of the scale, 5-9 the same degrees an octave
// higher, a-e an octave lower; '-' holds the note, '.' is a rest. Drum bars: D = deep don, d = soft don, k = ka (the rim).
const SCALE = [0, 1, 5, 7, 8];

type Voice = 'shamisen' | 'koto' | 'bass' | 'flute' | 'taiko';
interface Part {
  voice: Voice;
  /** one string per bar; the part cycles through them */
  bars: string[];
  vol: number;
}
export interface Tune {
  bpm: number;
  /** how many bars before it starts over */
  length: number;
  parts: Part[];
}

export const TUNES: Record<string, Tune> = {
  // 東海道: a brisk riff on the road
  tokaido: {
    bpm: 144,
    length: 4,
    parts: [
      { voice: 'shamisen', vol: 0.5, bars: ['0.23.5.43.2.0.1.', '2.34.5.76.5.43.2.', '0.23.5.87.5.3.5.7', '7.5.43.2.1.0.0.0-'] },
      { voice: 'bass', vol: 0.55, bars: ['0...0...0.1.0...', '0...0...0.0.3...'] },
      { voice: 'taiko', vol: 0.8, bars: ['D...k...D.d.k.d.', 'D...k.d.D...k.kk'] },
    ],
  },
  // 大將軍: trembling strings and a heavier drum
  shogun: {
    bpm: 168,
    length: 4,
    parts: [
      { voice: 'shamisen', vol: 0.45, bars: ['0101010101010101', '2222333344445555', '4343434343434343', '5.5.5.5.89.8.7.5.'] },
      { voice: 'bass', vol: 0.65, bars: ['0.0.0.0.0.0.0.0.', '0.0.1.0.0.0.1.0.'] },
      { voice: 'taiko', vol: 0.95, bars: ['D.dDk.dDD.dDk.kk', 'D.dDk.dDD.k.kkDD'] },
    ],
  },
  // 溫泉關: a slow march, a lonely flute
  onsen: {
    bpm: 104,
    length: 4,
    parts: [
      { voice: 'shamisen', vol: 0.5, bars: ['4...3...2.......', '0...2...3.......', '4...5...7...5...', '4...3...2...0...'] },
      { voice: 'flute', vol: 0.5, bars: ['5-------3-------', '2-------0-------', '7-------5-------', '3-------0-------'] },
      { voice: 'bass', vol: 0.55, bars: ['0...............', '0.......3.......'] },
      { voice: 'taiko', vol: 0.8, bars: ['D...d...D...d...', 'D...d...D.k.D.k.'] },
    ],
  },
  // 健康素食保衛戰: a bouncy street tune, plucked shamisen over a light koto and a tapping drum
  street: {
    bpm: 132,
    length: 4,
    parts: [
      { voice: 'shamisen', vol: 0.5, bars: ['0.2.3.2.0.2.3.5.', '3.5.7.5.3.2.3.2.', '0.2.3.2.0.2.3.5.', '7.5.3.2.0...0...'] },
      { voice: 'koto', vol: 0.3, bars: ['..0...2...3...2.', '..2...3...5...3.', '..0...2...3...2.', '..3...2...0...0.'] },
      { voice: 'bass', vol: 0.5, bars: ['0...0.0.0...2.0.', '0...0.0.3...2.0.'] },
      { voice: 'taiko', vol: 0.7, bars: ['D.k.d.k.D.k.d.kk', 'D.k.d.k.D.d.k.kk'] },
    ],
  },
  // 主選單: quiet koto
  menu: {
    bpm: 76,
    length: 4,
    parts: [
      { voice: 'koto', vol: 0.5, bars: ['0.2.3.5.3.2.0.2.', '1.3.4.6.4.3.1.3.', '0.2.3.5.7.5.3.2.', '3.2.0.2.0.a.0...'] },
      { voice: 'flute', vol: 0.4, bars: ['5---------------', '4-------3-------', '5-------7-------', '5---------------'] },
    ],
  },
};

const MIDI_BASE: Record<string, number> = { mid: 62, bass: 38 };

/** Which note a character means for a voice; null is a rest, 'hold' lengthens the note before it. */
function noteOf(c: string, voice: Voice): number | 'hold' | null {
  if (c === '-') return 'hold';
  const base = voice === 'bass' ? MIDI_BASE.bass : MIDI_BASE.mid;
  if (c >= '0' && c <= '4') return base + SCALE[+c];
  if (c >= '5' && c <= '9') return base + 12 + SCALE[+c - 5];
  if (c >= 'a' && c <= 'e') return base - 12 + SCALE[c.charCodeAt(0) - 97];
  return null;
}

export class Synth {
  readonly out: GainNode;
  private plucks = new Map<string, AudioBuffer>();
  private noise: AudioBuffer;
  private timer = 0;
  private nextStep = 0;
  private nextTime = 0;
  private bus: DynamicsCompressorNode;

  constructor(private ctx: AudioContext, private tune: Tune, dest: AudioNode) {
    this.out = ctx.createGain();
    this.bus = ctx.createDynamicsCompressor();
    this.out.connect(this.bus).connect(dest);
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 60);
    this.pump();
  }

  stop() {
    window.clearInterval(this.timer);
    window.setTimeout(() => this.out.disconnect(), 400);
  }

  private pump() {
    const step = 60 / this.tune.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.playStep(this.nextStep, this.nextTime, step);
      this.nextStep = (this.nextStep + 1) % (this.tune.length * 16);
      this.nextTime += step;
    }
  }

  private playStep(n: number, t: number, step: number) {
    const bar = Math.floor(n / 16);
    const slot = n % 16;
    for (const p of this.tune.parts) {
      const s = p.bars[bar % p.bars.length];
      const c = s[slot] ?? '.';
      if (p.voice === 'taiko') {
        if (c === 'D') this.don(t, p.vol);
        else if (c === 'd') this.don(t, p.vol * 0.5);
        else if (c === 'k') this.ka(t, p.vol);
        continue;
      }
      const note = noteOf(c, p.voice);
      if (note === null || note === 'hold') continue;
      let len = 1;
      while (s[slot + len] === '-') len++;
      if (p.voice === 'flute') this.flute(note, t, len * step, p.vol);
      else this.pluck(note, p.voice, t, p.vol);
    }
  }

  /** A plucked string: a burst of noise run round a delay line that loses a little of its brightness on every pass. */
  private pluckBuffer(midi: number, voice: 'shamisen' | 'koto' | 'bass'): AudioBuffer {
    const key = `${voice}${midi}`;
    let buf = this.plucks.get(key);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const n = Math.max(2, Math.round(sr / f));
    const dur = voice === 'koto' ? 1.8 : voice === 'bass' ? 1.3 : 0.9;
    const decay = voice === 'koto' ? 0.9985 : voice === 'bass' ? 0.998 : 0.9962;
    buf = this.ctx.createBuffer(1, Math.round(sr * dur), sr);
    const out = buf.getChannelData(0);
    const line = new Float32Array(n);
    for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
    // a softer start for the koto and the bass: smooth the noise a few times
    for (let r = 0; r < (voice === 'shamisen' ? 0 : 2); r++) for (let i = 0; i < n; i++) line[i] = (line[i] + line[(i + 1) % n]) / 2;
    for (let i = 0; i < out.length; i++) {
      const k = i % n;
      const next = ((line[k] + line[(k + 1) % n]) / 2) * decay;
      out[i] = line[k] * 0.9;
      line[k] = next;
    }
    // the shamisen's pick strikes the skin: a short slap
    if (voice === 'shamisen') for (let i = 0; i < 500; i++) out[i] += (Math.random() * 2 - 1) * 0.5 * (1 - i / 500);
    this.plucks.set(key, buf);
    return buf;
  }

  private pluck(midi: number, voice: 'shamisen' | 'koto' | 'bass', t: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi, voice);
    const g = this.ctx.createGain();
    g.gain.value = vol * (voice === 'bass' ? 0.8 : 0.55);
    if (voice === 'bass') {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      src.connect(lp).connect(g);
    } else src.connect(g);
    g.connect(this.out);
    src.start(t);
  }

  private don(t: number, vol: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.45);
    this.burst(t, 0.03, 700, 0.5, vol * 0.5);
  }

  private ka(t: number, vol: number) {
    this.burst(t, 0.07, 2200, 1.2, vol * 0.45);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = 260;
    g.gain.setValueAtTime(vol * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  private burst(t: number, dur: number, freq: number, q: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** The shakuhachi: a soft tone with a little vibrato that comes in late, and breath on top. */
  private flute(midi: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx;
    const f = 440 * 2 ** ((midi + 12 - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.32, t + 0.14);
    g.gain.setValueAtTime(vol * 0.32, t + Math.max(0.15, dur - 0.3));
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.out);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(1, dur * 0.7));
    lfo.connect(depth);
    for (const [mul, a] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      depth.connect(o.frequency);
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    const br = ctx.createBufferSource();
    br.buffer = this.noise;
    br.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    br.connect(bp).connect(bg).connect(g);
    br.start(t);
    br.stop(t + dur + 0.05);
  }
}
