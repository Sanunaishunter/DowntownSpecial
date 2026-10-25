export const WID = { None: 0, Stick: 1, Bamboo: 2, Stone: 3, Saber: 4, Rifle: 5 } as const;

export interface AtkDef {
  start: number;
  active: number;
  total: number;
  dmg: number;
  reach: number;
  kbx: number;
  knock: boolean;
  launch: number;
  stun: number;
}

export interface WeaponDef {
  id: number;
  name: string;
  mode: 'melee' | 'ranged';
  uses: number;
  atk: AtkDef;
  throwable: boolean;
  throwDmg: number;
  throwVx: number;
  dropWeight: number;
  bossWeight: number;
}

export const UNLIMITED = 999;

export const WEAPONS: Record<number, WeaponDef> = {
  [WID.Stick]: {
    id: WID.Stick, name: '木棒', mode: 'melee', uses: 14,
    atk: { start: 5, active: 4, total: 22, dmg: 14, reach: 34, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
    throwable: true, throwDmg: 12, throwVx: 4.2, dropWeight: 30, bossWeight: 0,
  },
  [WID.Bamboo]: {
    id: WID.Bamboo, name: '竹刀', mode: 'melee', uses: 18,
    atk: { start: 4, active: 4, total: 18, dmg: 12, reach: 36, kbx: 1.2, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 30, bossWeight: 0,
  },
  [WID.Stone]: {
    id: WID.Stone, name: '石頭', mode: 'melee', uses: UNLIMITED,
    atk: { start: 8, active: 4, total: 28, dmg: 20, reach: 22, kbx: 2.2, knock: true, launch: 2.6, stun: 0 },
    throwable: true, throwDmg: 24, throwVx: 3.4, dropWeight: 25, bossWeight: 0,
  },
  [WID.Saber]: {
    id: WID.Saber, name: '光劍', mode: 'melee', uses: 30,
    atk: { start: 3, active: 5, total: 16, dmg: 22, reach: 42, kbx: 2.0, knock: true, launch: 2.6, stun: 0 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 8, bossWeight: 50,
  },
  [WID.Rifle]: {
    id: WID.Rifle, name: 'AK-47', mode: 'ranged', uses: 30,
    atk: { start: 4, active: 3, total: 16, dmg: 9, reach: 24, kbx: 1.5, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 7, bossWeight: 50,
  },
};

export const BULLET = { speed: 7, life: 40, dmg: 7, kbx: 0.8, muzzleX: 22, muzzleZ: 20 };
