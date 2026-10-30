import { Btn, TICK_RATE } from './constants';

export interface SpecialDef {
  id: number;
  key: string;
  name: string;
  bit: number;
  /** skill strength (damage dealt / health healed / buff strength); the cooldown in seconds is power / 90 */
  power: number;
  /** ticks (60 per second) before it can be used again, counted from the moment it is used */
  cooldown: number;
}

const COOLDOWN_DIV = 90;
const def = (id: number, key: string, name: string, bit: number, power: number): SpecialDef => ({
  id,
  key,
  name,
  bit,
  power,
  cooldown: Math.round((power / COOLDOWN_DIV) * TICK_RATE),
});

// Six specials, one button each. All are ready at the start; using one starts its own cooldown.
export const SPECIALS: SpecialDef[] = [
  def(0, 'beam', '龜甲砲', Btn.S1, 1800),
  def(1, 'volley', '連拳彈', Btn.S2, 1350),
  def(2, 'halo', '光環', Btn.S3, 2700),
  def(3, 'aura', '爆氣', Btn.S4, 3600),
  def(4, 'shield', '聖盾', Btn.S5, 2700),
  def(5, 'thunder', '天雷萬鈞', Btn.S6, 7200),
];

export const SP = { Beam: 0, Volley: 1, Halo: 2, Aura: 3, Shield: 4, Thunder: 5 } as const;

/** The bar under the health bar shows how much of a running timed special is left (full = MP_MAX). */
export const MP_MAX = 100;

export const BEAM = { charge: 24, fire: 360, recover: 14, pulse: 5, len: 190, dmg: 2, halfDepth: 14 };
export const VOLLEY = { shots: 10, gap: 14, speed: 4.5, life: 50, dmg: 14 };
/**
 * 光環: a golden magic circle appears on the ground where it was cast and stays put for `dur` ticks. Everyone on the caster's
 * side standing inside it (an ellipse `rx` wide, `ry` deep) gets `rate` of their max health every `gap` ticks: 10% a second.
 */
export const HALO = { dur: 600, rx: 30, ry: 12, rate: 0.01, gap: 6 };
/**
 * Enemies cast 光環 on themselves now and then: hurt (below `below` of max health), standing around, off cooldown.
 * Their circle is shorter (4 seconds, so 40%) and the caster stays in it until it is over, or until it gets knocked out of it.
 */
export const ENEMY_HALO = { below: 0.6, dur: 240, chance: 1 / 90, cooldown: 600 };
/** 爆氣: +200% damage for 20 seconds. A 龜甲砲 fired while it lasts is `beamMul` times as long and as lasting. */
export const AURA = { dur: 1200, mult: 2, beamMul: 2 };
/** 聖盾: +200% defence (damage taken / 3), no flinching, no walking, 10 seconds. */
export const SHIELD = { dur: 600, def: 2 };
/** 天雷萬鈞: for 10 seconds lightning keeps coming down on the battlefield, one strike every `gap` ticks. */
export const THUNDER = { dur: 600, gap: 6, dmg: 8, radius: 20, aimed: 0.75 };
/** 百裂拳 (run + A, no weapon): 20 uninterruptible punches. 龍捲風腳 (run + B, no weapon): a spinning kick that hits both sides. */
export const BARRAGE = { punches: 20, gap: 4 };
export const TATSU = { total: 54, gap: 6, rise: 6, fall: 8, height: 12, speed: 1.1 };
