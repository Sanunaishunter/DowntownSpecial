import { Btn } from './constants';

export interface SpecialDef {
  id: number;
  key: string;
  name: string;
  bit: number;
  /** ticks (60 per second) before it can trigger again, counted from the moment it triggers */
  cooldown: number;
  /** relative chance in the random pick */
  weight: number;
}

// Six specials. When the energy meter is full one of the ones that are not cooling down fires at random.
export const SPECIALS: SpecialDef[] = [
  { id: 0, key: 'beam', name: '龜甲砲', bit: Btn.S1, cooldown: 1200, weight: 3 },
  { id: 1, key: 'volley', name: '連拳彈', bit: Btn.S2, cooldown: 900, weight: 3 },
  { id: 2, key: 'halo', name: '光環', bit: Btn.S3, cooldown: 1800, weight: 2 },
  { id: 3, key: 'aura', name: '爆氣', bit: Btn.S4, cooldown: 2400, weight: 2 },
  { id: 4, key: 'shield', name: '聖盾', bit: Btn.S5, cooldown: 1800, weight: 2 },
  { id: 5, key: 'ultimate', name: '主角威能', bit: Btn.S6, cooldown: 4800, weight: 1 },
];

export const SP = { Beam: 0, Volley: 1, Halo: 2, Aura: 3, Shield: 4, Ultimate: 5 } as const;

export const MP_MAX = 100;
export const MP_PER_HIT = 4;
export const MP_PER_KNOCKDOWN = 8;

export const BEAM = { charge: 24, fire: 360, recover: 14, pulse: 5, len: 190, dmg: 2, halfDepth: 14 };
export const VOLLEY = { shots: 10, gap: 14, speed: 4.5, life: 50, dmg: 14 };
/** 光環: full heal, the light column is only a visual. */
export const HALO = { vis: 110 };
/** 爆氣: +200% damage for 20 seconds. */
export const AURA = { dur: 1200, mult: 2 };
/** 聖盾: +200% defence (damage taken / 3), no flinching, no walking, 10 seconds. */
export const SHIELD = { dur: 600, def: 2 };
