import { STAGE_W } from './constants';

export interface WaveEnemy {
  def: string;
  side: 1 | -1;
  y: number;
  dx?: number;
}

export interface WaveDef {
  at: number;
  enemies: WaveEnemy[];
  items?: { kind: number; x: number; y: number }[];
}

export const STAGE: { width: number; waves: WaveDef[] } = {
  width: STAGE_W,
  waves: [
    {
      at: 0,
      enemies: [
        { def: 'zako', side: 1, y: 165 },
        { def: 'zako', side: 1, y: 190, dx: 28 },
        { def: 'zako', side: 1, y: 175, dx: 60 },
      ],
    },
    {
      at: 300,
      enemies: [
        { def: 'zako', side: 1, y: 160 },
        { def: 'zako', side: 1, y: 195, dx: 20 },
        { def: 'zako', side: -1, y: 175 },
        { def: 'zako', side: -1, y: 200, dx: 24 },
      ],
      items: [{ kind: 1, x: 400, y: 185 }],
    },
    {
      at: 600,
      enemies: [
        { def: 'zako', side: 1, y: 150 },
        { def: 'zako', side: 1, y: 180, dx: 24 },
        { def: 'zako', side: 1, y: 205, dx: 48 },
        { def: 'zako', side: -1, y: 170 },
        { def: 'zako', side: -1, y: 195, dx: 24 },
      ],
    },
    {
      at: 850,
      enemies: [
        { def: 'zako', side: 1, y: 160 },
        { def: 'zako', side: 1, y: 200, dx: 30 },
        { def: 'zako', side: -1, y: 180 },
      ],
      items: [{ kind: 1, x: 940, y: 170 }],
    },
    {
      at: STAGE_W - 256,
      enemies: [
        { def: 'ginpa', side: 1, y: 180 },
        { def: 'zako', side: 1, y: 155, dx: 40 },
        { def: 'zako', side: -1, y: 200 },
      ],
    },
  ],
};
