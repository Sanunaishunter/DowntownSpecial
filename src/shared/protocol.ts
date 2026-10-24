import { BTN_ALL } from './constants';

export type ClientMsg =
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'in'; h: number; p: number }
  | { t: 'ping'; n: number };

export function parseClientMsg(raw: string): ClientMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'create':
      return { t: 'create' };
    case 'join':
      if (typeof o.code !== 'string' || o.code.length > 12) return null;
      return { t: 'join', code: o.code.trim().toUpperCase() };
    case 'in': {
      const h = o.h;
      const p = o.p;
      if (!isMask(h) || !isMask(p)) return null;
      return { t: 'in', h, p };
    }
    case 'ping':
      if (typeof o.n !== 'number' || !Number.isFinite(o.n)) return null;
      return { t: 'ping', n: o.n };
    default:
      return null;
  }
}

function isMask(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= BTN_ALL;
}
