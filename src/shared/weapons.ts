export const WID = { None: 0, Stick: 1, Bamboo: 2, Stone: 3, Saber: 4, Rifle: 5, Gatling: 6, Twin: 7, Bow: 8, Naginata: 9, Raikiri: 10, Spear: 11 } as const;

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
  /** hits enemies behind as well as in front */
  both?: boolean;
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
  [WID.Twin]: {
    id: WID.Twin, name: '雙劍', mode: 'melee', uses: 40,
    atk: { start: 3, active: 4, total: 14, dmg: 15, reach: 38, kbx: 1.4, knock: false, launch: 2.2, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 10, bossWeight: 50,
  },
  // the three divine weapons (神兵): rare; only the bow wears out (500 arrows)
  [WID.Bow]: {
    id: WID.Bow, name: '遠古長弓', mode: 'ranged', uses: 500,
    atk: { start: 5, active: 3, total: 14, dmg: 6, reach: 24, kbx: 1.0, knock: false, launch: 2.0, stun: 20 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 4, bossWeight: 40,
  },
  [WID.Naginata]: {
    id: WID.Naginata, name: '鬼火雙頭薙刀', mode: 'melee', uses: UNLIMITED,
    atk: { start: 6, active: 5, total: 22, dmg: 16, reach: 42, kbx: 1.4, knock: false, launch: 2.2, stun: 18, both: true },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 4, bossWeight: 40,
  },
  [WID.Raikiri]: {
    id: WID.Raikiri, name: '雷切', mode: 'melee', uses: UNLIMITED,
    atk: { start: 4, active: 4, total: 16, dmg: 20, reach: 46, kbx: 1.6, knock: false, launch: 2.2, stun: 18 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 4, bossWeight: 40,
  },
  [WID.Spear]: {
    id: WID.Spear, name: '霸王槍', mode: 'melee', uses: UNLIMITED,
    atk: { start: 6, active: 4, total: 20, dmg: 18, reach: 58, kbx: 1.4, knock: false, launch: 2.2, stun: 18 },
    throwable: false, throwDmg: 0, throwVx: 0, dropWeight: 4, bossWeight: 40,
  },
};

/** Blades that can be held two at a time, one in each hand. */
export const BLADES: number[] = [WID.Bamboo, WID.Saber];

/**
 * 雙劍 (a blade in each hand): `chain` slashes in a row (each one started within `window` ticks of the last one ending)
 * turn into 炫風斬: the hero spreads both arms and spins like a top for `dur` ticks. He can still walk (`speed` x), cannot
 * be interrupted, and hits both sides every `gap` ticks. The blades lose `cost` uses once it is over.
 */
export const TWIN = { chain: 4, window: 20, dur: 600, gap: 8, dmg: 4, reach: 34, speed: 1, cost: 8 };

/**
 * 遠古長弓: hold A to keep drawing and loosing 靈氣箭. The string is drawn for `draw` ticks, then the arrow goes (one arrow
 * every `gap - 1` ticks). It steers towards the nearest enemy within `range`, turning at most `turn` radians a tick.
 */
export const BOW = { gap: 12, draw: 7, speed: 4.6, life: 90, dmg: 10, range: 140, turn: 0.13, kbx: 0.8, muzzleX: 18, muzzleZ: 20 };

/**
 * 奧義 萬箭齊發: while the bow keeps shooting, after `minRun` arrows in a row each new arrow has `chance` to turn into it. For
 * `dur` ticks (5 s) `count` arrows burst out of the hero and each one hunts down an enemy of its own anywhere on the screen.
 * The hero cannot be hurt meanwhile, and can walk about. The next one comes no sooner than `cooldown` ticks later.
 */
export const RAIN = { minRun: 4, chance: 0.2, cooldown: 900, dur: 300, count: 200, speed: 5.4, turn: 0.4, life: 80, dmg: 8, lift: 4 };

/**
 * 霸王槍 (the long spear with the red cloth tied under its head): an ordinary blow is a thrust with the longest reach of all,
 * and it goes through everyone standing in the line. A thrust sometimes turns into one of two moves instead, with `chance`:
 * 誰說沒槍頭就捅不死 (霸王破陣: the hero charges forward `thrustDur` ticks at `thrustSpeed`, stabbing everything on the way
 * every `thrustGap` ticks) or 沒槍頭照樣捅死你 (a whirl of the spear for `spinDur` ticks (5 s), hitting both sides every `spinGap` ticks while
 * he walks on at `spinSpeed` x). Neither can be interrupted. The next one comes no sooner than `cooldown` ticks after.
 */
export const SPEAR = {
  chance: 0.2, cooldown: 600,
  thrustDur: 40, thrustSpeed: 3.4, thrustGap: 4, thrustDmg: 9, thrustReach: 44,
  spinDur: 300, spinGap: 5, spinDmg: 7, spinReach: 54, spinSpeed: 0.6,
};

/** 鬼火雙頭薙刀: sets what it hits alight (`burnDmg` every `burnGap` ticks for `burn` ticks) and heals the wielder `heal` of max health per hit. */
export const NAGINATA = { burn: 180, burnGap: 30, burnDmg: 3, heal: 0.03 };

/** 雷切: the lightning jumps to `chainCount` more enemies within `chainRange` (`chainMul` of the damage); every `every`th hit a bolt falls from the sky. */
export const RAIKIRI = { chainRange: 64, chainCount: 2, chainMul: 0.4, every: 5, boltDmg: 28, boltRadius: 24 };

/**
 * 手持式加特靈機關槍: hold A to spray. Every shot heats the barrel; at `red` shots in a row it glows red, at `overheat`
 * it jams and has to rest `rest` ticks. The barrel cools by one every `cool` ticks while the trigger is released.
 */
export const GATLING = { gap: 3, red: 300, overheat: 500, rest: 600, cool: 4, dmg: 4, speed: 8, life: 34, kbx: 0.5, muzzleX: 26, muzzleZ: 20 };

export const BULLET = { speed: 7, life: 40, dmg: 7, kbx: 0.8, muzzleX: 22, muzzleZ: 20 };

/**
 * 鬼火旋舞 (the naginata, like the Monkey King spinning his staff): a swing sometimes turns into a spin instead, with `chance`.
 * For `dur` ticks the staff whirls in front of the hero like a wheel: it hits both sides every `gap` ticks, burns them, burns
 * away throwing stars and arrows that come near (`deflect` pixels), cannot be interrupted, and he walks on at `speed` x.
 * The next spin comes no sooner than `cooldown` ticks after this one began.
 */
export const STAFF = { chance: 0.2, cooldown: 300, dur: 100, gap: 5, dmg: 5, reach: 44, speed: 0.6, heal: 0.01, deflect: 26 };
