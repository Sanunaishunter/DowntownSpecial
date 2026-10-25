import { Btn } from './constants';

export interface SpecialDef {
  id: number;
  key: string;
  name: string;
  bit: number;
  implemented: boolean;
}

// Six slots. Only the first two exist so far; the rest are reserved for future moves.
export const SPECIALS: SpecialDef[] = [
  { id: 0, key: 'beam', name: '龜甲砲', bit: Btn.S1, implemented: true },
  { id: 1, key: 'volley', name: '連拳彈', bit: Btn.S2, implemented: true },
  { id: 2, key: 'slot3', name: '', bit: Btn.S3, implemented: false },
  { id: 3, key: 'slot4', name: '', bit: Btn.S4, implemented: false },
  { id: 4, key: 'slot5', name: '', bit: Btn.S5, implemented: false },
  { id: 5, key: 'slot6', name: '', bit: Btn.S6, implemented: false },
];

export const MP_MAX = 100;
export const MP_PER_HIT = 4;
export const MP_PER_KNOCKDOWN = 8;

export const BEAM = { charge: 24, fire: 360, pulse: 5, len: 190, dmg: 2, halfDepth: 14 };
export const VOLLEY = { shots: 10, gap: 14, speed: 4.5, life: 50, dmg: 14 };
