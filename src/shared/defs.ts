import type { FighterKind } from './types';

export interface Def {
  name: string;
  kind: FighterKind;
  hp: number;
  walk: number;
  run: number;
  dmg: number;
  score: number;
  /** throws projectiles from a distance */
  ranged?: boolean;
}

export const DEFS: Record<string, Def> = {
  ichiro: { name: '一郎', kind: 'player', hp: 100, walk: 1.0, run: 2.0, dmg: 1, score: 0 },
  jiro: { name: '二郎', kind: 'player', hp: 120, walk: 0.9, run: 1.9, dmg: 1.15, score: 0 },
  saburo: { name: '三郎', kind: 'grunt', hp: 34, walk: 0.55, run: 1.6, dmg: 0.7, score: 100 },
  ninja: { name: '忍者', kind: 'grunt', hp: 28, walk: 0.8, run: 1.9, dmg: 0.8, score: 150, ranged: true },
  bushi: { name: '上層武士', kind: 'grunt', hp: 52, walk: 0.65, run: 1.7, dmg: 1.1, score: 250 },
  bandit: { name: '山賊', kind: 'grunt', hp: 30, walk: 0.7, run: 1.7, dmg: 0.8, score: 80 },
  chief: { name: '山賊頭目', kind: 'boss', hp: 230, walk: 0.75, run: 2.1, dmg: 1.2, score: 1500 },
  shogun: { name: '大將軍', kind: 'boss', hp: 170, walk: 0.8, run: 2.2, dmg: 1.1, score: 1000 },
};

export const PLAYER_DEFS = ['ichiro', 'jiro'];
