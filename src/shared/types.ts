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
  ev: GameEvent[];
  cam: number;
  camMax: number;
  wave: number;
  locked: boolean;
  status: 0 | 1 | 2;
  statusT: number;
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
  w: number;
  v: number;
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
  s: 0 | 1 | 2;
  wv: number;
  wt: number;
  lk: 0 | 1;
  sl: SnapSlot[];
  f: SnapFighter[];
  it: SnapItem[];
  ev: GameEvent[];
}
