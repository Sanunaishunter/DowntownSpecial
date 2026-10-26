export const WID = { None: 0, Stick: 1, Bamboo: 2, Stone: 3, Saber: 4, Rifle: 5, Gatling: 6 } as const;

/** Item kind of the 1UP the general drops: picked up by walking over it, never held. */
export const ITEM_1UP = 100;
/** Item kind of the tonic that raises the health bar cap and the mana bar cap; also taken by walking over it. */
export const ITEM_TONIC = 101;

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

/** The ninja's throwing star (shot kind 2, owner 0 = an enemy shot). */
export const SHURIKEN = { speed: 3.2, life: 90, dmg: 6, kbx: 0.6, z: 20 };

export const UNLIMITED = 100000;

export const WEAPONS: Record<number, WeaponDef> = {
  [WID.Stick]: {
    id: WID.Stick, name: '木棒', mode: 'melee', uses: 14,
    atk: { start: 5, active: 4, total: 22, dmg: 14, reach: 34, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
    throwable: true, throwDmg: 12, throwVx: 4.2, dropWeight: 20, bossWeight: 0,
  },
  [WID.Bamboo]: {
    id: WID.Bamboo, name: '竹刀', mode: 'melee', uses: 18,
    atk: { start: 4, active: 4, total: 18, dmg: 12, reach: 36, kbx: 1.2, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 20, bossWeight: 0,
  },
  [WID.Stone]: {
    id: WID.Stone, name: '石頭', mode: 'melee', uses: UNLIMITED,
    atk: { start: 8, active: 4, total: 28, dmg: 20, reach: 22, kbx: 2.2, knock: true, launch: 2.6, stun: 0 },
    throwable: true, throwDmg: 24, throwVx: 3.4, dropWeight: 20, bossWeight: 0,
  },
  [WID.Saber]: {
    id: WID.Saber, name: '光劍', mode: 'melee', uses: 30,
    atk: { start: 3, active: 5, total: 16, dmg: 22, reach: 42, kbx: 2.0, knock: true, launch: 2.6, stun: 0 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 20, bossWeight: 50,
  },
  [WID.Rifle]: {
    id: WID.Rifle, name: 'AK-47', mode: 'ranged', uses: 30,
    atk: { start: 4, active: 3, total: 16, dmg: 9, reach: 24, kbx: 1.5, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 20, bossWeight: 50,
  },
  [WID.Gatling]: {
    id: WID.Gatling, name: '加特靈機槍', mode: 'ranged', uses: 1000,
    atk: { start: 5, active: 4, total: 20, dmg: 12, reach: 26, kbx: 1.5, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 10, bossWeight: 50,
  },
};

/**
 * 手持式加特靈機關槍: hold A to spray. Every shot heats the barrel; at `red` shots in a row it glows red, at `overheat`
 * it jams and has to rest `rest` ticks. The barrel cools by one every `cool` ticks while the trigger is released.
 */
export const GATLING = { gap: 3, red: 300, overheat: 500, rest: 600, cool: 4, dmg: 4, speed: 8, life: 34, kbx: 0.5, muzzleX: 26, muzzleZ: 20 };

export const BULLET = { speed: 7, life: 40, dmg: 7, kbx: 0.8, muzzleX: 22, muzzleZ: 20 };
