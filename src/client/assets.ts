import { ST_NAMES } from '../shared/types';

export interface SpriteDef {
  image: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  fps?: number;
  anims: Record<string, number[]>;
}

interface Loaded {
  def: SpriteDef;
  img: HTMLImageElement;
  cols: number;
}

export class Assets {
  private sheets = new Map<string, Loaded>();

  async load() {
    try {
      const r = await fetch('/assets/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const manifest = (await r.json()) as Record<string, SpriteDef>;
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
    } catch {
      /* no custom art: placeholders are used */
    }
  }

  get count() {
    return this.sheets.size;
  }

  has(def: string) {
    return this.sheets.has(def);
  }

  draw(ctx: CanvasRenderingContext2D, def: string, st: number, t: number): boolean {
    const s = this.sheets.get(def);
    if (!s) return false;
    const name = ST_NAMES[st] ?? 'idle';
    const frames = s.def.anims[name] ?? s.def.anims.idle;
    if (!frames || frames.length === 0) return false;
    const fps = s.def.fps ?? 8;
    const idx = frames[Math.floor((t / 60) * fps) % frames.length];
    const sx = (idx % s.cols) * s.def.w;
    const sy = Math.floor(idx / s.cols) * s.def.h;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.img, sx, sy, s.def.w, s.def.h, -s.def.ox, -s.def.oy, s.def.w, s.def.h);
    return true;
  }
}
