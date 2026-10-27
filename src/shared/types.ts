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
  Whirl: 26,
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
  /** dual swords: slashes in the current chain, and the ticks left to keep it going with another one */
  slash: number;
  slashT: number;
  /** 1 = moved by the stage script, not by the AI (the envoy in the opening scene of 溫泉關) */
  script: number;
  /** hit counter: blows landed in a row, and the ticks left before it starts over */
  chain: number;
  chainT: number;
  /** the move name being shouted (see CRY) and its ticks left */
  cry: number;
  cryT: number;
  /** 1 = flying towards the hot spring: not held inside the walking area */
  plunge: number;
  /** 溫泉關 elite: 1 = elite, 2 = the traitor */
  elite: number;
  jumpT: number;
  cd: number;
  aiT: number;
  lastSlot: number;
  wn: number;
  /** the blade in the other hand when two blades are held (雙持), and its uses left */
  weapon2: number;
  wn2: number;
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

/** x, y, z, kind, and for the damage numbers (kinds 6 and 7) the damage */
export type GameEvent = [x: number, y: number, z: number, kind: number, value?: number];

export interface World {
  /** how many pixels wide the screen is: 256, or wider for the wide view */
  viewW: number;
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
  /** which stage is on: 0 the Tokaido, 1 溫泉關 */
  stage: 0 | 1;
  /** 溫泉關: 0 opening scene, 1 fighting, 2 held */
  phase: 0 | 1 | 2;
  phaseT: number;
  /** 溫泉關: enemies defeated, elites let in so far, and whether the traitor has shown up */
  kills: number;
  spawned: number;
  traitor: number;
  /** [code, ticks left] of the big text over the fight */
  banner: [number, number] | null;
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
  /** second blade in the other hand, 0 = none */
  w2: number;
  v: number;
  e: number;
  n: number;
  n2: number;
  c: number;
  /** gatling barrel: 0..500 = heat, 501..510 = jammed with that many seconds left */
  ht: number;
  /** 光環 circle: [x, y, ticks left] while it is on the ground, otherwise empty */
  hl: number[];
  /** buffs: 1 aura, 2 shield, 4 halo light, 8 a buff is about to end, 16 lightning storm, 32 elite, 64 traitor, 128 scripted (envoy) */
  b: number;
  /** cooldown ticks left per special (players only, empty for everyone else) */
  k: number[];
  /** hit counter */
  cb: number;
  /** the move name being shouted, 0 = none */
  cr: number;
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
  /** screen width in pixels */
  vw: number;
  /** laps finished */
  lp: number;
  /** stage, 溫泉關 phase, ticks in the phase, enemies defeated there, and the banner [code, ticks left] or [] */
  sg: 0 | 1;
  ph: number;
  pt: number;
  kl: number;
  bn: number[];
  sl: SnapSlot[];
  f: SnapFighter[];
  it: SnapItem[];
  sh: SnapShot[];
  ev: GameEvent[];
}
