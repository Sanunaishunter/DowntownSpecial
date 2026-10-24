import type { FighterKind } from './types';

export interface Def {
  name: string;
  kind: FighterKind;
  hp: number;
  walk: number;
  run: number;
  dmg: number;
  score: number;
}

export const DEFS: Record<string, Def> = {
  kunimasa: { name: '國政', kind: 'player', hp: 100, walk: 1.0, run: 2.0, dmg: 1, score: 0 },
  rikigoro: { name: '力五郎', kind: 'player', hp: 120, walk: 0.9, run: 1.9, dmg: 1.15, score: 0 },
  zako: { name: '雜兵', kind: 'grunt', hp: 34, walk: 0.55, run: 1.6, dmg: 0.7, score: 100 },
  ginpa: { name: '銀八', kind: 'boss', hp: 150, walk: 0.8, run: 2.2, dmg: 1.0, score: 1000 },
};

export const PLAYER_DEFS = ['kunimasa', 'rikigoro'];
