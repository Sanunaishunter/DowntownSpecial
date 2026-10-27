import { ST_NAMES } from '../shared/types';

export interface AnimDef {
  frames: number[];
  ticks?: number[];
  loop?: boolean;
  loopFrom?: number;
}

export interface SpriteDef {
  image: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  fps?: number;
  muzzle?: [number, number];
  anims: Record<string, number[] | AnimDef>;
}

function pickFrame(anim: number[] | AnimDef, t: number, fps: number): number | undefined {
  if (Array.isArray(anim)) return anim.length ? anim[Math.floor((t / 60) * fps) % anim.length] : undefined;
  const frames = anim.frames;
  if (!frames.length) return undefined;
  if (!anim.ticks || anim.ticks.length !== frames.length) return frames[Math.floor((t / 60) * fps) % frames.length];
  const total = anim.ticks.reduce((a, b) => a + b, 0);
  let u = anim.loop ? t % total : Math.min(t, total - 1);
  if (!anim.loop && anim.loopFrom !== undefined && t >= total) {
    const start = anim.ticks.slice(0, anim.loopFrom).reduce((a, b) => a + b, 0);
    u = start + ((t - start) % (total - start));
  }
  for (let i = 0; i < frames.length; i++) {
    if (u < anim.ticks[i]) return frames[i];
    u -= anim.ticks[i];
  }
  return frames[frames.length - 1];
}

interface BackdropLayer {
  image: string;
  w: number;
  h: number;
  parallax: number;
  y?: number;
}

interface Loaded {
  def: SpriteDef;
  img: HTMLImageElement;
  cols: number;
}

export class Assets {
  private sheets = new Map<string, Loaded>();
  private layers: { def: BackdropLayer; img: HTMLImageElement }[] = [];
  private onsen: HTMLImageElement | null = null;

  async load() {
    try {
      const r = await fetch('/assets/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const manifest = (await r.json()) as Record<string, SpriteDef>;
      const backdrop = (manifest as unknown as Record<string, Record<string, BackdropLayer> | undefined>)._backdrop;
      await Promise.all(
        Object.entries(manifest).map(async ([name, def]) => {
          if (!def || typeof def.image !== 'string' || !def.anims) return;
          const img = new Image();
          img.src = `/assets/${def.image}`;
          try {
            await img.decode();
          } catch {
            return;
          }
          this.sheets.set(name, { def, img, cols: Math.max(1, Math.floor(img.width / def.w)) });
        }),
      );
      if (backdrop) await this.loadBackdrop(backdrop);
      const onsen = (manifest as unknown as Record<string, { image?: string } | undefined>)._onsen;
      if (onsen && typeof onsen.image === 'string') {
        const img = new Image();
        img.src = `/assets/${onsen.image}`;
        try {
          await img.decode();
          this.onsen = img;
        } catch {
          /* the plain fallback is drawn */
        }
      }
    } catch {
      /* no custom art: placeholders are used */
    }
  }

  private async loadBackdrop(b: Record<string, BackdropLayer>) {
    const layers: { def: BackdropLayer; img: HTMLImageElement }[] = [];
    for (const key of ['sky', 'mid', 'road']) {
      const def = b[key];
      if (!def || typeof def.image !== 'string') return;
      const img = new Image();
      img.src = `/assets/${def.image}`;
      try {
        await img.decode();
      } catch {
        return;
      }
      layers.push({ def, img });
    }
    this.layers = layers;
  }

  /** Draws sky / middle / road layers; returns false when there are no background images. */
  drawBackdrop(ctx: CanvasRenderingContext2D, cam: number, width: number): boolean {
    if (!this.layers.length) return false;
    ctx.imageSmoothingEnabled = false;
    for (const { def, img } of this.layers) {
      const y = def.y ?? 0;
      if (def.parallax >= 1) {
        for (let x = -(Math.round(cam) % def.w); x < width; x += def.w) ctx.drawImage(img, x, y);
      } else {
        ctx.drawImage(img, -Math.round(cam * def.parallax), y);
      }
    }
    return true;
  }

  /** The one-screen picture of 溫泉關; false when it is not there. */
  drawOnsen(ctx: CanvasRenderingContext2D): boolean {
    if (!this.onsen) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.onsen, 0, 0);
    return true;
  }

  get count() {
    return this.sheets.size;
  }

  has(def: string) {
    return this.sheets.has(def);
  }

  muzzle(def: string): [number, number] {
    return this.sheets.get(def)?.def.muzzle ?? [22, -20];
  }

  hasArmed(def: string, weapon: number) {
    const suffix = weapon === 1 ? '_w' : `_w${weapon}`;
    return !!this.sheets.get(def)?.def.anims[`idle${suffix}`];
  }

  draw(ctx: CanvasRenderingContext2D, def: string, st: number, t: number, weapon = 0, animName?: string): 0 | 1 | 2 {
    const s = this.sheets.get(def);
    if (!s) return 0;
    const name = animName ?? ST_NAMES[st] ?? 'idle';
    const suffix = weapon === 1 ? '_w' : weapon > 1 ? `_w${weapon}` : '';
    const armed = suffix ? (s.def.anims[`${name}${suffix}`] ?? (name === 'land' ? s.def.anims[`idle${suffix}`] : undefined)) : undefined;
    const anim = armed ?? s.def.anims[name] ?? s.def.anims.idle;
    if (!anim) return 0;
    const idx = pickFrame(anim, t, s.def.fps ?? 8);
    if (idx === undefined) return 0;
    const sx = (idx % s.cols) * s.def.w;
    const sy = Math.floor(idx / s.cols) * s.def.h;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.img, sx, sy, s.def.w, s.def.h, -s.def.ox, -s.def.oy, s.def.w, s.def.h);
    return armed ? 2 : 1;
  }
}
