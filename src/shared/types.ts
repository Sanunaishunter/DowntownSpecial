export const St = {
  Idle: 0,
  Walk: 1,
  Run: 2,
  Jump: 3,
  Punch: 4,
  Kick: 5,
  AirKick: 6,
  Dash: 7,
  Upper: 8,
  Hurt: 9,
  Down: 10,
  GetUp: 11,
  Swing: 12,
  Throw: 13,
  Lift: 14,
  Hold: 15,
  Held: 16,
  Stomp: 17,
  Dead: 18,
  HoldSwing: 19,
  Pick: 20,
  Beam: 21,
  Shoot: 22,
  Land: 23,
  Barrage: 24,
  Tatsu: 25,
} as const;

export const ST_NAMES: string[] = [];
for (const [k, v] of Object.entries(St)) ST_NAMES[v] = k.toLowerCase();

export type FighterKind = 'player' | 'grunt' | 'boss';

export interface Fighter {
  id: number;
  kind: FighterKind;
  def: string;
  slot: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  face: 1 | -1;
  st: number;
  t: number;
  hp: number;
  maxHp: number;
  /** cap of the blue bar (raised by tonics, nothing draws on it yet) */
  mpMax: number;
  weapon: number;
  holding: number;
  heldBy: number;
  thrown: number;
  hits: number[];
  combo: number;
  inv: number;
  stun: number;
  pend: number;
  pendT: number;
  buf: number;
  bufT: number;
  tapDir: number;
  tapT: number;
  jumpT: number;
  cd: number;
  aiT: number;
  lastSlot: number;
  wn: number;
  mp: number;
  volley: number;
  volleyCd: number;
  cast: number;
  /** per-special cooldown ticks (index = special id) */
  sp: number[];
  aura: number;
  shield: number;
  halo: number;
  /** where the 光環 circle was cast */
  haloX: number;
  haloY: number;
  /** 天雷萬鈞 ticks left */
  storm: number;
  /** gatling: shots fired in this burst, and the rest ticks left once it has jammed */
  heat: number;
  heatCd: number;
  /** 1 while a timed special is running (drives the meter drain) */
  spOn: number;
}

export interface Item {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  n: number;
}

export interface Shot {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  owner: number;
  life: number;
}

export interface PlayerSlot {
  a: 0 | 1;
  lives: number;
  score: number;
  fid: number;
  rt: number;
}

export type GameEvent = [x: number, y: number, z: number, kind: number];

export interface World {
  tick: number;
  stageT: number;
  seed: number;
  nextId: number;
  fighters: Fighter[];
  items: Item[];
  shots: Shot[];
  ev: GameEvent[];
  cam: number;
  camMax: number;
  wave: number;
  locked: boolean;
  /** 0 playing, 2 game over (the stage itself never ends, see lap) */
  status: 0 | 2;
  statusT: number;
  /** laps finished: the stage loops forever, each time the general falls the next lap starts */
  lap: number;
  /** ticks since the last wave of the lap was cleared */
  lapT: number;
  slots: PlayerSlot[];
}

export interface PlayerInput {
  held: number;
  pressed: number;
}

export interface SnapFighter {
  i: number;
  d: string;
  x: number;
  y: number;
  z: number;
  r: 1 | -1;
  s: number;
  t: number;
  h: number;
  m: number;
  /** blue bar cap */
  em: number;
  w: number;
  v: number;
  e: number;
  n: number;
  c: number;
  /** gatling barrel: 0..500 = heat, 501..510 = jammed with that many seconds left */
  ht: number;
  /** 光環 circle: [x, y, ticks left] while it is on the ground, otherwise empty */
  hl: number[];
  /** buffs: 1 aura, 2 shield, 4 halo light, 8 a buff is about to end, 16 lightning storm */
  b: number;
  /** cooldown ticks left per special (players only, empty for everyone else) */
  k: number[];
}

export interface SnapShot {
  k: number;
  x: number;
  y: number;
  z: number;
  r: 1 | -1;
}

export interface SnapItem {
  i: number;
  k: number;
  x: number;
  y: number;
  z: number;
}

export interface SnapSlot {
  a: 0 | 1;
  l: number;
  p: number;
  f: number;
}

export interface Snapshot {
  n: number;
  c: number;
  s: 0 | 2;
  wv: number;
  wt: number;
  lk: 0 | 1;
  /** laps finished */
  lp: number;
  sl: SnapSlot[];
  f: SnapFighter[];
  it: SnapItem[];
  sh: SnapShot[];
  ev: GameEvent[];
}
