import { Btn, GRAVITY, GROUND_MAX, GROUND_MIN, JUMP_V, MAX_PLAYERS, SCREEN_W, SPECIAL_MASK, STAGE_W } from './constants';
import { DEFS, PLAYER_DEFS } from './defs';
import { AURA, BARRAGE, BEAM, ENEMY_HALO, HALO, MP_MAX, SHIELD, SP, SPECIALS, TATSU, THUNDER, VOLLEY } from './specials';
import { STAGE, type WaveDef } from './stage';
import { St, type Fighter, type PlayerInput, type Snapshot, type World } from './types';
import { BULLET, GATLING, ITEM_1UP, ITEM_TONIC, SHURIKEN, UNLIMITED, WEAPONS, WID, type AtkDef } from './weapons';

const PEND_WINDOW = 3;
const UPPER_WINDOW = 12;
const AB = Btn.A | Btn.B;
const HOLD_Z = 34;
const DROP_RATE = 0.33;
/** ticks after the last wave of a lap is cleared before the next lap starts */
const LAP_DELAY = 150;
const MAX_LIVES = 9;
/** each lap enemies get this much more health and attack (of their base values), and one more enemy per wave */
const LAP_STAT_STEP = 0.1;
/** chance that a defeated enemy leaves a tonic */
const TONIC_RATE = 0.1;
const TONIC_BONUS = 10;

const ATK: Record<number, AtkDef> = {
  [St.Punch]: { start: 2, active: 3, total: 12, dmg: 6, reach: 20, kbx: 1.0, knock: false, launch: 0, stun: 20 },
  [St.Kick]: { start: 5, active: 4, total: 20, dmg: 9, reach: 25, kbx: 1.5, knock: true, launch: 2.2, stun: 0 },
  [St.AirKick]: { start: 3, active: 999, total: 999, dmg: 8, reach: 22, kbx: 1.6, knock: true, launch: 2.0, stun: 0 },
  [St.Dash]: { start: 2, active: 24, total: 32, dmg: 10, reach: 20, kbx: 2.0, knock: true, launch: 2.4, stun: 0 },
  [St.Upper]: { start: 1, active: 12, total: 999, dmg: 12, reach: 16, kbx: 0.6, knock: true, launch: 3.2, stun: 0 },
  [St.Swing]: { start: 5, active: 4, total: 22, dmg: 14, reach: 34, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
  [St.HoldSwing]: { start: 6, active: 5, total: 24, dmg: 12, reach: 30, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
  [St.Stomp]: { start: 4, active: 3, total: 20, dmg: 8, reach: 14, kbx: 0, knock: false, launch: 0, stun: 0 },
  [St.Barrage]: { start: 2, active: BARRAGE.punches * BARRAGE.gap, total: 2 + BARRAGE.punches * BARRAGE.gap + 2, dmg: 3, reach: 24, kbx: 0.3, knock: false, launch: 0, stun: 18 },
  [St.Tatsu]: { start: TATSU.rise, active: TATSU.total - TATSU.rise - TATSU.fall, total: TATSU.total, dmg: 5, reach: 26, kbx: 0.6, knock: false, launch: 0, stun: 18 },
};

/** Moves that hit again and again: the hit list is wiped every `gap` ticks; the last hit knocks down. `both` = hits both sides. */
const MULTI: Record<number, { gap: number; both?: boolean }> = {
  [St.Barrage]: { gap: BARRAGE.gap },
  [St.Tatsu]: { gap: TATSU.gap, both: true },
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function rand(w: { seed: number }): number {
  let t = (w.seed = (w.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function setSt(f: Fighter, st: number) {
  f.st = st;
  f.t = 0;
  f.hits = [];
}

function mkFighter(w: World, def: string, slot: number, x: number, y: number): Fighter {
  const d = DEFS[def];
  return {
    id: w.nextId++,
    kind: d.kind,
    def,
    slot,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    face: 1,
    st: St.Idle,
    t: 0,
    hp: d.hp,
    maxHp: d.hp,
    mpMax: MP_MAX,
    weapon: 0,
    holding: 0,
    heldBy: 0,
    thrown: 0,
    hits: [],
    combo: 0,
    inv: 0,
    stun: 0,
    pend: 0,
    pendT: 0,
    buf: 0,
    bufT: 0,
    tapDir: 0,
    tapT: 0,
    jumpT: 0,
    cd: 0,
    aiT: 0,
    lastSlot: -1,
    wn: 0,
    mp: 0,
    volley: 0,
    volleyCd: 0,
    cast: 0,
    sp: [0, 0, 0, 0, 0, 0],
    aura: 0,
    shield: 0,
    halo: 0,
    haloX: 0,
    haloY: 0,
    storm: 0,
    heat: 0,
    heatCd: 0,
    spOn: 0,
  };
}

export function createWorld(seed = 1): World {
  return {
    tick: 0,
    stageT: 0,
    seed,
    nextId: 1,
    fighters: [],
    items: [],
    shots: [],
    ev: [],
    cam: 0,
    camMax: STAGE.waves[0].at,
    wave: 0,
    locked: false,
    status: 0,
    statusT: 0,
    lap: 0,
    lapT: 0,
    slots: Array.from({ length: MAX_PLAYERS }, () => ({ a: 0 as const, lives: 3, score: 0, fid: 0, rt: 0 })),
  };
}

export function resetWorld(w: World) {
  const active = w.slots.map((s) => s.a);
  w.stageT = 0;
  w.fighters = [];
  w.items = [];
  w.shots = [];
  w.ev = [];
  w.cam = 0;
  w.camMax = STAGE.waves[0].at;
  w.wave = 0;
  w.locked = false;
  w.status = 0;
  w.statusT = 0;
  w.lap = 0;
  w.lapT = 0;
  w.slots.forEach((s, i) => {
    s.a = 0;
    s.fid = 0;
    if (active[i]) addPlayer(w, i);
  });
}

export function addPlayer(w: World, slot: number) {
  const s = w.slots[slot];
  if (!s || s.a) return;
  s.a = 1;
  s.lives = 3;
  s.score = 0;
  s.rt = 0;
  const f = mkFighter(w, PLAYER_DEFS[slot], slot, w.cam + 40 + slot * 30, 170 + slot * 14);
  f.inv = 60;
  w.fighters.push(f);
  s.fid = f.id;
}

export function removePlayer(w: World, slot: number) {
  const s = w.slots[slot];
  if (!s || !s.a) return;
  const f = byId(w, s.fid);
  if (f) {
    if (f.holding) dropHeld(w, f);
    w.fighters = w.fighters.filter((x) => x !== f);
  }
  s.a = 0;
  s.fid = 0;
}

function byId(w: World, id: number): Fighter | undefined {
  if (!id) return undefined;
  return w.fighters.find((f) => f.id === id);
}

function isPlayer(f: Fighter) {
  return f.kind === 'player';
}

function vulnerable(t: Fighter) {
  return t.st !== St.Down && t.st !== St.GetUp && t.st !== St.Dead && t.heldBy === 0 && t.inv === 0;
}

export function step(w: World, inputs: Array<PlayerInput | undefined>) {
  w.tick++;
  w.stageT++;
  for (const f of w.fighters) {
    if (f.heldBy) continue;
    if (isPlayer(f)) updatePlayer(w, f, inputs[f.slot]);
    else updateEnemy(w, f);
  }
  for (const f of w.fighters) if (f.heldBy) placeHeld(w, f);
  applyAttacks(w);
  applyThrown(w);
  updateItems(w);
  pickUpWalkOvers(w);
  tickHalos(w);
  updateShots(w);
  w.fighters = w.fighters.filter((f) => !(!isPlayer(f) && f.st === St.Dead && f.t >= 40));
  updateStage(w);
}

// ---------- player ----------

function updatePlayer(w: World, f: Fighter, inp: PlayerInput | undefined) {
  // the two run buttons count as walking that way, and start a run while they are held
  const rawHeld = inp?.held ?? 0;
  const runDir = rawHeld & Btn.RunR ? 1 : rawHeld & Btn.RunL ? -1 : 0;
  const held = rawHeld | (rawHeld & Btn.RunR ? Btn.Right : 0) | (rawHeld & Btn.RunL ? Btn.Left : 0);
  const pressed = inp?.pressed ?? 0;
  const d = DEFS[f.def];
  if (f.inv > 0) f.inv--;
  if (f.tapT > 0) f.tapT--;
  for (let i = 0; i < f.sp.length; i++) if (f.sp[i] > 0) f.sp[i]--;
  if (f.aura > 0) f.aura--;
  if (f.shield > 0) f.shield--;
  if (f.halo > 0) f.halo--;
  const rooted = f.shield > 0;

  const act = f.st === St.Idle || f.st === St.Walk || f.st === St.Run || f.st === St.Jump || f.st === St.Hold || f.st === St.Land;
  const rawDx = (held & Btn.Right ? 1 : 0) - (held & Btn.Left ? 1 : 0);
  const dx = rooted ? 0 : rawDx;
  const dy = rooted ? 0 : (held & Btn.Down ? 1 : 0) - (held & Btn.Up ? 1 : 0);

  let pr = pressed & AB;
  if (act) {
    if (f.bufT > 0) {
      pr |= f.buf;
      f.buf = 0;
      f.bufT = 0;
    }
  } else if (pr) {
    f.buf |= pr;
    f.bufT = 10;
  } else if (f.bufT > 0 && --f.bufT === 0) {
    f.buf = 0;
  }

  if (act) {
    const grounded = f.z === 0 && f.st !== St.Jump;
    if (runDir && grounded && !rooted && (f.st === St.Idle || f.st === St.Walk || f.st === St.Land)) {
      setSt(f, St.Run);
      f.face = runDir;
      f.tapT = 0;
    }
    if (pressed & (Btn.Left | Btn.Right)) {
      const dir = pressed & Btn.Right ? 1 : -1;
      if (grounded && !rooted && f.st !== St.Hold && f.tapDir === dir && f.tapT > 0) {
        setSt(f, St.Run);
        f.face = dir;
        f.tapT = 0;
      } else {
        f.tapDir = dir;
        f.tapT = 15;
      }
    }

    if (f.st === St.Idle || f.st === St.Walk || f.st === St.Land) {
      if (dx || dy) {
        f.st = St.Walk;
        f.vx = dx * d.walk;
        f.vy = dy * d.walk * 0.7;
        if (dx) f.face = dx > 0 ? 1 : -1;
      } else {
        if (f.st !== St.Land) f.st = St.Idle;
        f.vx = 0;
        f.vy = 0;
        if (rooted && rawDx) f.face = rawDx > 0 ? 1 : -1;
      }
    } else if (f.st === St.Run) {
      if (dx === f.face) {
        f.vx = f.face * d.run;
        f.vy = dy * d.walk * 0.7;
      } else {
        setSt(f, St.Idle);
        f.vx = 0;
        f.vy = 0;
      }
    } else if (f.st === St.Hold) {
      f.vx = dx * d.walk * 0.6;
      f.vy = dy * d.walk * 0.45;
      if (dx) f.face = dx > 0 ? 1 : -1;
    }

    if (f.pend) {
      const other = f.pend === Btn.A ? Btn.B : Btn.A;
      if (pr & other) {
        f.pend = 0;
        resolveAction(w, f, true, true, dx);
      } else if (--f.pendT <= 0) {
        const p = f.pend;
        f.pend = 0;
        resolveAction(w, f, p === Btn.A, p === Btn.B, dx);
      }
    } else if (pr) {
      if ((pr & AB) === AB) resolveAction(w, f, true, true, dx);
      else {
        f.pend = pr & AB;
        f.pendT = PEND_WINDOW;
      }
    }
  }
  if (f.cast > 0) f.cast--;
  if (f.volley > 0) tickVolley(w, f);
  if (pressed & SPECIAL_MASK) {
    for (const s of SPECIALS) if (pressed & s.bit && canStartSpecial(f, s.id)) triggerSpecial(w, f, s.id);
  }
  if (f.storm > 0) tickStorm(w, f);
  tickHeat(w, f);
  if (f.weapon === WID.Gatling) {
    // the gun keeps spraying while A is held, and stops when it is let go, empty or jammed
    if (f.st === St.Shoot && (!(held & Btn.A) || f.wn <= 0 || f.heatCd > 0)) setSt(f, St.Idle);
  } else if (f.st === St.Shoot && f.t >= 9 && held & Btn.A && !(held & Btn.B) && f.wn > 0) setSt(f, St.Shoot);
  updateBody(w, f);
  updateMeter(f);
}

function resolveAction(w: World, f: Fighter, a: boolean, b: boolean, dx: number) {
  const air = f.z > 0 || f.st === St.Jump;
  if (a && b) {
    if (air || f.st === St.Hold) return;
    const down = nearestDowned(w, f);
    if (down) {
      setSt(f, St.Stomp);
      f.vx = 0;
      f.vy = 0;
      return;
    }
    if (f.shield > 0) return;
    const run = f.st === St.Run;
    const d = DEFS[f.def];
    setSt(f, St.Jump);
    f.jumpT = 0;
    f.vz = JUMP_V;
    f.vx = run ? f.face * d.run * 0.9 : dx * d.walk * 1.1;
    f.vy = 0;
    if (!run && dx) f.face = dx > 0 ? 1 : -1;
    return;
  }
  if (air) {
    if (f.weapon || f.holding) return;
    if (a && f.st === St.Jump && f.jumpT <= UPPER_WINDOW) {
      setSt(f, St.Upper);
      f.vz = Math.max(f.vz, 2.2);
      f.vx = f.face * 0.4;
    } else if (f.st === St.Jump) {
      setSt(f, St.AirKick);
    }
    return;
  }
  if (f.st === St.Hold) {
    if (a) {
      setSt(f, St.HoldSwing);
    } else {
      throwHeld(w, f);
    }
    return;
  }
  if (f.weapon) {
    const wd = WEAPONS[f.weapon];
    if (b) throwWeapon(w, f);
    else if (wd.mode === 'ranged' && f.wn > 0 && !(f.weapon === WID.Gatling && f.heatCd > 0)) setSt(f, St.Shoot);
    else setSt(f, St.Swing);
    f.vx = 0;
    f.vy = 0;
    return;
  }
  const it = nearestItem(w, f);
  if (it) {
    w.items = w.items.filter((x) => x !== it);
    f.weapon = it.kind;
    f.wn = it.n;
    setSt(f, St.Pick);
    f.vx = 0;
    f.vy = 0;
    return;
  }
  const down = nearestDowned(w, f);
  if (down && a) {
    setSt(f, St.Lift);
    f.vx = 0;
    f.vy = 0;
    f.holding = down.id;
    setSt(down, St.Held);
    down.heldBy = f.id;
    down.vx = 0;
    down.vy = 0;
    down.vz = 0;
    down.thrown = 0;
    return;
  }
  if (f.st === St.Run) {
    // empty-handed run + A / B: 百裂拳 / 龍捲風腳
    setSt(f, a ? St.Barrage : St.Tatsu);
    f.vx = 0;
    f.vy = 0;
    return;
  }
  setSt(f, a ? St.Punch : St.Kick);
  f.vx = 0;
  f.vy = 0;
}

function nearestDowned(w: World, f: Fighter): Fighter | undefined {
  let best: Fighter | undefined;
  let bd = 1e9;
  for (const e of w.fighters) {
    if (isPlayer(e) || e.st !== St.Down || e.z > 0 || e.hp <= 0 || e.heldBy || e.thrown) continue;
    if (Math.abs(e.vx) > 0.3) continue;
    const dx = Math.abs(e.x - f.x);
    const dy = Math.abs(e.y - f.y);
    if (dx > 18 || dy > 9) continue;
    if (dx + dy < bd) {
      bd = dx + dy;
      best = e;
    }
  }
  return best;
}

function nearestItem(w: World, f: Fighter) {
  for (const it of w.items) {
    if (it.owner || it.z > 1 || it.kind >= ITEM_1UP) continue;
    if (Math.abs(it.x - f.x) <= 16 && Math.abs(it.y - f.y) <= 9) return it;
  }
  return undefined;
}

/** B: throw the weapon away. Throwing ones fly and hurt; the rest are just tossed a little way so another can be picked up. */
function throwWeapon(w: World, f: Fighter) {
  const wd = WEAPONS[f.weapon];
  setSt(f, St.Throw);
  w.items.push({
    id: w.nextId++,
    kind: f.weapon,
    x: f.x + f.face * 8,
    y: f.y,
    z: f.z + 14,
    vx: f.face * (wd.throwable ? wd.throwVx : 1.4),
    vy: 0,
    vz: wd.throwable ? 0.8 : 0.5,
    owner: wd.throwable ? f.slot + 1 : 0,
    n: f.wn,
  });
  f.weapon = 0;
  f.wn = 0;
}

function throwHeld(w: World, f: Fighter) {
  const e = byId(w, f.holding);
  setSt(f, St.Throw);
  f.vx = 0;
  f.vy = 0;
  f.holding = 0;
  if (!e) return;
  e.heldBy = 0;
  setSt(e, St.Down);
  e.z = f.z + HOLD_Z;
  e.vz = 1.0;
  e.vx = f.face * 3.4;
  e.vy = 0;
  e.thrown = f.slot + 1;
  e.lastSlot = f.slot;
  e.face = f.face;
}

function dropHeld(w: World, holder: Fighter) {
  const e = byId(w, holder.holding);
  holder.holding = 0;
  if (!e) return;
  e.heldBy = 0;
  setSt(e, St.Down);
  e.vx = 0;
  e.vy = 0;
  e.vz = 0.8;
  e.z = holder.z + HOLD_Z;
}

function placeHeld(w: World, e: Fighter) {
  const holder = byId(w, e.heldBy);
  if (!holder) {
    e.heldBy = 0;
    setSt(e, St.Down);
    return;
  }
  e.x = holder.x + holder.face * 4;
  e.y = holder.y + 0.5;
  e.z = holder.z + (holder.st === St.Lift ? HOLD_Z * Math.min(1, holder.t / 14) : HOLD_Z);
  e.face = holder.face;
}

// ---------- enemy ----------

function nearestPlayer(w: World, e: Fighter): Fighter | undefined {
  let best: Fighter | undefined;
  let bd = 1e9;
  for (const p of w.fighters) {
    if (!isPlayer(p) || p.st === St.Dead) continue;
    const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function updateEnemy(w: World, e: Fighter) {
  const d = DEFS[e.def];
  if (e.inv > 0) e.inv--;
  if (e.halo > 0) e.halo--;
  if (e.sp[SP.Halo] > 0) e.sp[SP.Halo]--;
  if (e.st === St.Idle || e.st === St.Walk) {
    // 光環: a hurt enemy that is not busy sometimes heals itself with holy light, and stands still for a moment doing it
    if (e.hp > 0 && e.hp < e.maxHp * ENEMY_HALO.below && e.sp[SP.Halo] <= 0 && rand(w) < ENEMY_HALO.chance) {
      startHalo(w, e, ENEMY_HALO.dur);
      e.sp[SP.Halo] = ENEMY_HALO.cooldown;
      e.aiT = Math.max(e.aiT, ENEMY_HALO.dur);
      e.vx = 0;
      e.vy = 0;
    }
    const tgt = nearestPlayer(w, e);
    if (!tgt) {
      e.vx = 0;
      e.vy = 0;
      e.st = St.Idle;
    } else {
      if (e.cd > 0) e.cd--;
      const dx = tgt.x - e.x;
      const dy = tgt.y - e.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      e.face = dx >= 0 ? 1 : -1;
      const stand = e.kind === 'boss' ? 22 : 20;
      if (e.aiT > 0) {
        e.aiT--;
        e.vx = 0;
        e.vy = 0;
        e.st = St.Idle;
      } else if (adx <= stand + 4 && ady <= 7 && e.cd <= 0 && attackersActive(w) < 2) {
        setSt(e, rand(w) < 0.6 ? St.Punch : St.Kick);
        e.vx = 0;
        e.vy = 0;
        e.cd = 40 + Math.floor(rand(w) * 70);
        e.aiT = 10 + Math.floor(rand(w) * 20);
      } else if (e.kind === 'boss' && adx > 80 && ady < 10 && e.cd <= 0 && rand(w) < 0.02) {
        setSt(e, St.Dash);
        e.cd = 90;
      } else if (d.ranged && adx > 56 && adx < 150 && ady < 9 && e.cd <= 0 && rand(w) < 0.03) {
        setSt(e, St.Shoot);
        e.vx = 0;
        e.vy = 0;
        e.cd = 140 + Math.floor(rand(w) * 60);
      } else {
        const wx = tgt.x - e.face * stand;
        const mx = wx - e.x;
        const my = tgt.y - e.y;
        e.vx = Math.abs(mx) > 1 ? Math.sign(mx) * d.walk : 0;
        e.vy = Math.abs(my) > 1 ? Math.sign(my) * d.walk * 0.7 : 0;
        e.st = e.vx || e.vy ? St.Walk : St.Idle;
      }
    }
  }
  updateBody(w, e);
}

function attackersActive(w: World) {
  let n = 0;
  for (const f of w.fighters) {
    if (!isPlayer(f) && (f.st === St.Punch || f.st === St.Kick || f.st === St.Dash)) n++;
  }
  return n;
}

// ---------- shared body update ----------

function updateBody(w: World, f: Fighter) {
  f.t++;
  const wasAir = f.z > 0;
  f.x += f.vx;
  f.y += f.vy;
  if (wasAir || f.vz > 0) {
    f.z += f.vz;
    f.vz -= GRAVITY;
    if (f.z <= 0) {
      f.z = 0;
      f.vz = 0;
    }
  }
  const landed = wasAir && f.z === 0;
  if (isPlayer(f)) f.x = clamp(f.x, Math.max(8, w.cam + 8), Math.min(STAGE_W - 8, w.cam + SCREEN_W - 8));
  else f.x = clamp(f.x, 0, STAGE_W);
  f.y = clamp(f.y, GROUND_MIN, GROUND_MAX);

  switch (f.st) {
    case St.Jump:
    case St.AirKick:
    case St.Upper:
      f.jumpT++;
      if (landed) {
        f.vx = 0;
        setSt(f, isPlayer(f) ? St.Land : St.Idle);
      }
      break;
    case St.Land:
      if (f.t >= 6) setSt(f, St.Idle);
      break;
    case St.Punch:
    case St.Kick:
    case St.Swing:
    case St.Stomp:
    case St.Pick:
    case St.Throw:
      f.vx = 0;
      f.vy = 0;
      if (f.t >= (atkFor(f)?.total ?? (f.st === St.Pick ? 10 : 12))) setSt(f, St.Idle);
      break;
    case St.Shoot:
      f.vx = 0;
      f.vy = 0;
      if (isPlayer(f) && f.weapon === WID.Gatling) {
        if (f.t % GATLING.gap === 1) fireGatling(w, f);
        break;
      }
      if (DEFS[f.def].ranged) {
        if (f.t === 3) throwShuriken(w, f);
      } else if (f.t === 2) fireBullet(w, f);
      if (f.t >= 10) {
        if (f.wn <= 0 && !DEFS[f.def].ranged) breakWeapon(w, f);
        setSt(f, St.Idle);
      }
      break;
    case St.Beam:
      updateBeam(w, f);
      break;
    case St.Barrage:
      f.vx = f.face * 0.25;
      f.vy = 0;
      if (f.t >= ATK[St.Barrage].total) {
        f.vx = 0;
        setSt(f, St.Idle);
      }
      break;
    case St.Tatsu:
      updateTatsu(f);
      break;
    case St.HoldSwing:
      f.vx = 0;
      f.vy = 0;
      if (f.t >= ATK[St.HoldSwing].total) setSt(f, St.Hold);
      break;
    case St.Lift:
      f.vx = 0;
      f.vy = 0;
      if (f.t >= 14) setSt(f, St.Hold);
      break;
    case St.Dash:
      f.vx = f.face * (isPlayer(f) ? 2.6 : 2.8);
      f.vy = 0;
      if (f.t >= ATK[St.Dash].total) {
        f.vx = 0;
        setSt(f, St.Idle);
      }
      break;
    case St.Hurt:
      f.vx *= 0.85;
      if (f.t >= f.stun) {
        f.vx = 0;
        f.combo = 0;
        setSt(f, St.Idle);
      }
      break;
    case St.Down:
      if (landed) {
        f.t = 0;
        f.vx *= 0.4;
        if (f.thrown) {
          f.lastSlot = f.thrown - 1;
          f.thrown = 0;
          f.hp = Math.max(0, f.hp - 6);
          w.ev.push([f.x, f.y, 4, 1]);
        }
      }
      if (f.z === 0) {
        f.vx *= 0.85;
        if (Math.abs(f.vx) < 0.05) f.vx = 0;
        if (f.t >= 45) {
          if (f.hp > 0) setSt(f, St.GetUp);
          else die(w, f);
        }
      }
      break;
    case St.GetUp:
      f.vx = 0;
      if (f.t >= 20) {
        f.inv = 20;
        setSt(f, St.Idle);
      }
      break;
    case St.Dead:
      f.vx *= 0.8;
      break;
    default:
      break;
  }
}

function die(w: World, f: Fighter) {
  setSt(f, St.Dead);
  f.vx = 0;
  if (isPlayer(f)) {
    const s = w.slots[f.slot];
    s.lives--;
    s.rt = 0;
    f.weapon = 0;
    f.wn = 0;
    f.mp = 0;
    f.volley = 0;
    f.aura = 0;
    f.shield = 0;
    f.halo = 0;
    f.storm = 0;
    f.spOn = 0;
  } else {
    if (f.lastSlot >= 0 && w.slots[f.lastSlot]) w.slots[f.lastSlot].score += DEFS[f.def].score;
    dropOnDeath(w, f);
  }
}

// ---------- combat ----------

/** `chain`: part of a flurry (or a spray), so being hit again and again never counts towards the three-hit knockdown. */
function hit(w: World, t: Fighter, srcSlot: number, dmg: number, kbx: number, knock: boolean, launch: number, dir: number, chain = false) {
  // 百裂拳 and 龍捲風腳 cannot be interrupted: the hits still hurt, unless they would be lethal
  const firm = isPlayer(t) && (t.st === St.Barrage || t.st === St.Tatsu);
  if (isPlayer(t) && (t.shield > 0 || firm)) {
    // 聖盾: a third of the damage and no flinching, unless it would still be lethal
    if (t.shield > 0) dmg = Math.max(1, Math.round(dmg / (1 + SHIELD.def)));
    if (t.hp - dmg > 0) {
      t.hp -= dmg;
      t.combo = 0;
      w.ev.push([t.x, t.y, t.z + 14, 3]);
      return;
    }
  }
  if (t.holding) dropHeld(w, t);
  t.pend = 0;
  t.pendT = 0;
  t.hp = Math.max(0, t.hp - dmg);
  if (srcSlot >= 0) t.lastSlot = srcSlot;
  t.combo++;
  const down = t.hp <= 0 || knock || (!chain && t.combo >= 3) || t.z > 0;
  t.face = dir > 0 ? -1 : 1;
  if (down) {
    if (t.weapon) {
      w.items.push({ id: w.nextId++, kind: t.weapon, x: t.x, y: t.y, z: t.z, vx: 0, vy: 0, vz: 0, owner: 0, n: t.wn });
      t.weapon = 0;
      t.wn = 0;
    }
    if (t.volley) {
      t.volley = 0;
      t.mp = 0;
    }
    setSt(t, St.Down);
    t.vz = launch > 0 ? launch : 1.8;
    t.vx = dir * Math.max(kbx, 0.8);
    t.vy = 0;
    t.combo = 0;
    w.ev.push([t.x, t.y, t.z + 14, 1]);
  } else {
    setSt(t, St.Hurt);
    t.vx = dir * kbx * 0.4;
    t.vy = 0;
    t.stun = 18;
    w.ev.push([t.x, t.y, t.z + 14, 0]);
  }
}

function applyAttacks(w: World) {
  for (const a of w.fighters) {
    const atk = atkFor(a);
    if (!atk || a.heldBy) continue;
    if (a.t < atk.start || a.t >= atk.start + atk.active) continue;
    const multi = MULTI[a.st];
    if (multi && (a.t - atk.start) % multi.gap === 0) a.hits = [];
    if (a.st === St.HoldSwing && a.t === atk.start) {
      const e = byId(w, a.holding);
      if (e) e.hp = Math.max(1, e.hp - 6);
    }
    const mul = DEFS[a.def].dmg * (a.aura > 0 ? AURA.mult : 1) * (isPlayer(a) ? 1 : lapMul(w));
    for (const t of w.fighters) {
      if (t === a || t.heldBy || isPlayer(t) === isPlayer(a)) continue;
      if (a.hits.includes(t.id)) continue;
      if (a.st === St.Stomp) {
        if (t.st !== St.Down || t.z > 0) continue;
      } else if (!vulnerable(t)) continue;
      const rx = (t.x - a.x) * a.face;
      if (multi?.both ? Math.abs(rx) > atk.reach + 6 : rx < -6 || rx > atk.reach + 6) continue;
      if (Math.abs(t.y - a.y) > 9) continue;
      if (Math.abs(t.z - a.z) > 24) continue;
      a.hits.push(t.id);
      const dmg = Math.max(1, Math.round(atk.dmg * mul));
      if (a.st === St.Stomp) {
        t.hp = Math.max(0, t.hp - dmg);
        t.t = Math.min(t.t, 20);
        if (a.slot >= 0) t.lastSlot = a.slot;
        w.ev.push([t.x, t.y, 6, 0]);
      } else {
        if (multi) {
          // the last hit of a flurry sends them flying; the ones before it only keep them pinned
          const last = a.t + multi.gap >= atk.start + atk.active;
          hit(w, t, a.slot, dmg, last ? 2.0 : atk.kbx, last, last ? 2.4 : 0, multi.both && t.x < a.x ? -1 : multi.both ? 1 : a.face, true);
        } else hit(w, t, a.slot, dmg, atk.kbx, atk.knock, atk.launch, a.face);
        if (a.st === St.Swing) useWeapon(w, a);
      }
    }
  }
}

function applyThrown(w: World) {
  for (const b of w.fighters) {
    if (!b.thrown || b.st !== St.Down || b.z <= 0) continue;
    for (const t of w.fighters) {
      if (t === b || isPlayer(t) || t.heldBy || b.hits.includes(t.id) || !vulnerable(t)) continue;
      if (Math.abs(t.x - b.x) <= 14 && Math.abs(t.y - b.y) <= 10 && Math.abs(t.z - b.z) <= 24) {
        b.hits.push(t.id);
        hit(w, t, b.thrown - 1, 10, 2.2, true, 2.2, b.vx >= 0 ? 1 : -1);
      }
    }
  }
}

function updateItems(w: World) {
  for (const it of w.items) {
    it.x += it.vx;
    it.y += it.vy;
    if (it.z > 0 || it.vz > 0) {
      it.z += it.vz;
      it.vz -= GRAVITY * 0.5;
      if (it.z <= 0) {
        it.z = 0;
        it.vz = 0;
        it.vx = 0;
        it.vy = 0;
        it.owner = 0;
      }
    }
    if (it.owner) {
      for (const t of w.fighters) {
        if (isPlayer(t) || !vulnerable(t)) continue;
        if (Math.abs(t.x - it.x) <= 12 && Math.abs(t.y - it.y) <= 10 && Math.abs(t.z + 12 - it.z) <= 22) {
          hit(w, t, it.owner - 1, WEAPONS[it.kind]?.throwDmg ?? 12, 1.8, true, 2.2, it.vx >= 0 ? 1 : -1);
          it.owner = 0;
          it.vx = 0;
          it.vy = 0;
          break;
        }
      }
    }
    it.x = clamp(it.x, 0, STAGE_W);
    it.y = clamp(it.y, GROUND_MIN, GROUND_MAX);
  }
}

// ---------- weapons, specials, shots ----------

function atkFor(f: Fighter): AtkDef | undefined {
  if (f.st === St.Swing) {
    const wd = WEAPONS[f.weapon];
    if (wd) return wd.atk;
  }
  return ATK[f.st];
}

function useWeapon(w: World, f: Fighter) {
  const wd = WEAPONS[f.weapon];
  if (!wd || wd.mode === 'ranged' || wd.uses >= UNLIMITED) return;
  if (--f.wn <= 0) breakWeapon(w, f);
}

function breakWeapon(w: World, f: Fighter) {
  f.weapon = 0;
  f.wn = 0;
  w.ev.push([f.x + f.face * 10, f.y, f.z + 16, 2]);
}

function dropOnDeath(w: World, f: Fighter) {
  const boss = f.kind === 'boss';
  if (boss) w.items.push({ id: w.nextId++, kind: ITEM_1UP, x: f.x - 18, y: f.y, z: 14, vx: 0, vy: 0, vz: 0.5, owner: 0, n: 0 });
  if (rand(w) < TONIC_RATE) w.items.push({ id: w.nextId++, kind: ITEM_TONIC, x: f.x + 18, y: f.y, z: 14, vx: 0, vy: 0, vz: 0.5, owner: 0, n: 0 });
  if (!boss && rand(w) >= DROP_RATE) return;
  const defs = Object.values(WEAPONS);
  const weights = defs.map((d) => (boss ? d.bossWeight : d.dropWeight));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  let r = rand(w) * total;
  let pick = defs[0];
  for (let i = 0; i < defs.length; i++) {
    r -= weights[i];
    if (r < 0) {
      pick = defs[i];
      break;
    }
  }
  w.items.push({ id: w.nextId++, kind: pick.id, x: f.x, y: f.y, z: 12, vx: 0, vy: 0, vz: 0.4, owner: 0, n: pick.uses });
}

function slotMul(w: World, slot: number) {
  const s = w.slots[slot];
  const p = s && s.a ? byId(w, s.fid) : undefined;
  return p && p.aura > 0 ? AURA.mult : 1;
}

/** True while a timed special is running; the meter then shows how much of it is left. */
function specialActive(f: Fighter) {
  return f.st === St.Beam || f.volley > 0 || f.aura > 0 || f.shield > 0 || f.storm > 0;
}

/**
 * A special can be used when it is off cooldown and the hero is on their feet. Beam, shield and the ultimate root the hero
 * (or throw them into the beam), so those also need solid ground and no other beam running.
 */
function canStartSpecial(f: Fighter, id: number) {
  if (f.hp <= 0 || f.sp[id] > 0 || f.holding) return false;
  if (f.st === St.Hurt || f.st === St.Down || f.st === St.GetUp || f.st === St.Dead || f.st === St.Held || f.st === St.Stomp) return false;
  if (id === SP.Beam) return f.z === 0 && f.st !== St.Beam && f.st !== St.Barrage && f.st !== St.Tatsu;
  if (id === SP.Shield) return f.z === 0 && f.st !== St.Beam;
  return true;
}

function triggerSpecial(w: World, f: Fighter, id: number) {
  f.pend = 0;
  f.buf = 0;
  f.bufT = 0;
  f.spOn = 1;
  switch (id) {
    case SP.Beam:
      setSt(f, St.Beam);
      f.vx = 0;
      f.vy = 0;
      break;
    case SP.Volley:
      f.volley = VOLLEY.shots;
      f.volleyCd = 0;
      break;
    case SP.Halo:
      startHalo(w, f, HALO.dur);
      break;
    case SP.Aura:
      f.aura = AURA.dur;
      break;
    case SP.Shield:
      f.shield = SHIELD.dur;
      f.vx = 0;
      f.vy = 0;
      if (f.st === St.Run || f.st === St.Walk) setSt(f, St.Idle);
      break;
    case SP.Thunder:
      f.storm = THUNDER.dur;
      break;
  }
  f.sp[id] = SPECIALS[id].cooldown;
}

/** 光環: puts the golden circle on the ground right where `f` stands. */
function startHalo(w: World, f: Fighter, dur: number) {
  f.halo = dur;
  f.haloX = f.x;
  f.haloY = f.y;
  w.ev.push([f.x, f.y, 14, 1]);
}

/** Every `gap` ticks each live circle heals everybody on its caster's side who stands inside it. */
function tickHalos(w: World) {
  for (const c of w.fighters) {
    if (c.halo <= 0 || c.hp <= 0 || c.st === St.Dead || c.halo % HALO.gap !== 0) continue;
    const team = isPlayer(c);
    for (const t of w.fighters) {
      if (t.hp <= 0 || t.st === St.Dead || isPlayer(t) !== team || t.hp >= t.maxHp) continue;
      const nx = (t.x - c.haloX) / HALO.rx;
      const ny = (t.y - c.haloY) / HALO.ry;
      if (nx * nx + ny * ny <= 1) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * HALO.rate);
    }
  }
}

/** Keeps the energy bar draining while a timed special runs, and empties it when they are over. */
function updateMeter(f: Fighter) {
  if (f.hp <= 0) return;
  let frac = -1;
  if (f.st === St.Beam) {
    const fireT = f.t - BEAM.charge;
    frac = Math.max(frac, fireT < 0 ? 1 : fireT < BEAM.fire ? 1 - fireT / BEAM.fire : 0);
  }
  if (f.volley > 0) frac = Math.max(frac, f.volley / VOLLEY.shots);
  if (f.aura > 0) frac = Math.max(frac, f.aura / AURA.dur);
  if (f.shield > 0) frac = Math.max(frac, f.shield / SHIELD.dur);
  if (f.storm > 0) frac = Math.max(frac, f.storm / THUNDER.dur);
  if (frac >= 0) {
    f.mp = Math.round(MP_MAX * frac);
    f.spOn = 1;
  } else if (f.spOn) {
    f.mp = 0;
    f.spOn = 0;
  }
}

function tickVolley(w: World, f: Fighter) {
  if (f.st === St.Hurt || f.st === St.Down || f.st === St.Dead || f.st === St.GetUp || f.st === St.Held) {
    f.volley = 0;
    return;
  }
  if (--f.volleyCd > 0) return;
  w.shots.push({ id: w.nextId++, kind: 1, x: f.x + f.face * 14, y: f.y, z: f.z + 16, vx: f.face * VOLLEY.speed, owner: f.slot + 1, life: VOLLEY.life });
  f.volley--;
  f.volleyCd = VOLLEY.gap;
  f.cast = 8;
}

function throwShuriken(w: World, f: Fighter) {
  w.shots.push({ id: w.nextId++, kind: 2, x: f.x + f.face * 12, y: f.y, z: f.z + SHURIKEN.z, vx: f.face * SHURIKEN.speed, owner: 0, life: SHURIKEN.life });
}

function fireBullet(w: World, f: Fighter) {
  w.shots.push({ id: w.nextId++, kind: 0, x: f.x + f.face * BULLET.muzzleX, y: f.y, z: f.z + BULLET.muzzleZ, vx: f.face * BULLET.speed, owner: f.slot + 1, life: BULLET.life });
  f.wn--;
}

function updateShots(w: World) {
  for (const s of w.shots) {
    s.x += s.vx;
    if (--s.life <= 0 || s.x < w.cam - 20 || s.x > w.cam + SCREEN_W + 20) {
      s.life = 0;
      continue;
    }
    if (s.owner === 0) {
      // an enemy throwing star hits players only
      for (const t of w.fighters) {
        if (!isPlayer(t) || !vulnerable(t)) continue;
        if (Math.abs(t.x - s.x) > 8 || Math.abs(t.y - s.y) > 7 || Math.abs(t.z + 14 - s.z) > 16) continue;
        hit(w, t, -1, Math.round(SHURIKEN.dmg * lapMul(w)), SHURIKEN.kbx, false, 0, s.vx >= 0 ? 1 : -1);
        s.life = 0;
        break;
      }
      continue;
    }
    for (const t of w.fighters) {
      if (isPlayer(t) || !vulnerable(t)) continue;
      if (Math.abs(t.x - s.x) > 9 || Math.abs(t.y - s.y) > 8 || Math.abs(t.z + 14 - s.z) > 18) continue;
      const dir = s.vx >= 0 ? 1 : -1;
      const mul = slotMul(w, s.owner - 1);
      if (s.kind === 1) hit(w, t, s.owner - 1, Math.round(VOLLEY.dmg * mul), 2.2, true, 2.4, dir);
      else if (s.kind === 3) hit(w, t, s.owner - 1, Math.round(GATLING.dmg * mul), GATLING.kbx, false, 0, dir, true);
      else hit(w, t, s.owner - 1, Math.round(BULLET.dmg * mul), BULLET.kbx, false, 0, dir);
      s.life = 0;
      break;
    }
  }
  w.shots = w.shots.filter((s) => s.life > 0);
}

function updateBeam(w: World, f: Fighter) {
  f.vx = 0;
  f.vy = 0;
  f.inv = Math.max(f.inv, 2);
  const fireT = f.t - BEAM.charge;
  if (fireT >= BEAM.fire + BEAM.recover) {
    setSt(f, St.Idle);
    return;
  }
  if (fireT >= BEAM.fire || fireT < 0) return;
  if (fireT % BEAM.pulse !== 0) return;
  const dmg = Math.max(1, Math.round(BEAM.dmg * DEFS[f.def].dmg * (f.aura > 0 ? AURA.mult : 1)));
  for (const t of w.fighters) {
    if (isPlayer(t) || t.heldBy) continue;
    if (t.st === St.Down || t.st === St.GetUp || t.st === St.Dead) continue;
    const rx = (t.x - f.x) * f.face;
    if (rx < 4 || rx > BEAM.len + 10) continue;
    if (Math.abs(t.y - f.y) > BEAM.halfDepth) continue;
    if (Math.abs(t.z - f.z - 14) > 30) continue;
    pinHit(w, t, f.slot, dmg, f.face);
  }
}

/** Damage that keeps the target pinned in place (beam, lightning): no knockback unless it is the killing blow. */
function pinHit(w: World, t: Fighter, srcSlot: number, dmg: number, dir: number) {
  if (t.holding) dropHeld(w, t);
  t.hp = Math.max(0, t.hp - dmg);
  t.lastSlot = srcSlot;
  t.pend = 0;
  t.pendT = 0;
  if (t.hp <= 0) {
    setSt(t, St.Down);
    t.vz = 2.4;
    t.vx = dir * 2;
    t.vy = 0;
    t.combo = 0;
    w.ev.push([t.x, t.y, t.z + 14, 1]);
  } else {
    if (t.st !== St.Hurt) setSt(t, St.Hurt);
    t.t = 0;
    t.stun = 12;
    t.vx = 0;
    t.vy = 0;
    w.ev.push([t.x, t.y, t.z + 14, 0]);
  }
}

/** 龍捲風腳: rise a little, hover and drift forward while spinning, then drop. */
function updateTatsu(f: Fighter) {
  const t = f.t;
  f.vy = 0;
  f.vz = 0;
  f.vx = t >= TATSU.rise - 2 && t < TATSU.total - TATSU.fall ? f.face * TATSU.speed : 0;
  if (t < TATSU.rise) f.z = (TATSU.height * t) / TATSU.rise;
  else if (t < TATSU.total - TATSU.fall) f.z = TATSU.height;
  else f.z = Math.max(0, (TATSU.height * (TATSU.total - t)) / TATSU.fall);
  if (t >= TATSU.total) {
    f.z = 0;
    f.vx = 0;
    setSt(f, St.Idle);
  }
}

/** 加特靈: the barrel cools while the trigger is released, and a jammed gun rests until it is ready. */
function tickHeat(w: World, f: Fighter) {
  if (f.heatCd > 0) {
    if (--f.heatCd === 0) f.heat = 0;
  } else if (f.heat > 0 && !(f.st === St.Shoot && f.weapon === WID.Gatling) && w.tick % GATLING.cool === 0) f.heat--;
}

function fireGatling(w: World, f: Fighter) {
  if (f.heatCd > 0 || f.wn <= 0) return;
  w.shots.push({ id: w.nextId++, kind: 3, x: f.x + f.face * GATLING.muzzleX, y: f.y, z: f.z + GATLING.muzzleZ, vx: f.face * GATLING.speed, owner: f.slot + 1, life: GATLING.life });
  f.wn--;
  if (++f.heat >= GATLING.overheat) f.heatCd = GATLING.rest;
  if (f.wn <= 0) {
    breakWeapon(w, f);
    setSt(f, St.Idle);
  }
}

/** 天雷萬鈞: a bolt every few ticks, mostly aimed at an enemy on screen, otherwise anywhere on the ground. */
function tickStorm(w: World, f: Fighter) {
  f.storm--;
  if ((THUNDER.dur - f.storm) % THUNDER.gap !== 0) return;
  const foes = w.fighters.filter((t) => !isPlayer(t) && t.st !== St.Dead && t.x > w.cam - 20 && t.x < w.cam + SCREEN_W + 20);
  let sx: number;
  let sy: number;
  if (foes.length && rand(w) < THUNDER.aimed) {
    const t = foes[Math.floor(rand(w) * foes.length)];
    sx = t.x;
    sy = t.y;
  } else {
    sx = w.cam + 8 + rand(w) * (SCREEN_W - 16);
    sy = GROUND_MIN + rand(w) * (GROUND_MAX - GROUND_MIN);
  }
  w.ev.push([sx, sy, 0, 4]);
  const dmg = Math.max(1, Math.round(THUNDER.dmg * DEFS[f.def].dmg * (f.aura > 0 ? AURA.mult : 1)));
  for (const t of w.fighters) {
    if (isPlayer(t) || t.heldBy || t.st === St.Down || t.st === St.GetUp || t.st === St.Dead) continue;
    if (Math.abs(t.x - sx) > THUNDER.radius || Math.abs(t.y - sy) > 10) continue;
    pinHit(w, t, f.slot, dmg, t.x >= sx ? 1 : -1);
  }
}

// ---------- stage ----------

/** Enemies are 10% stronger per lap finished, in health and attack. */
function lapMul(w: World) {
  return 1 + LAP_STAT_STEP * w.lap;
}

function spawnWave(w: World, wd: WaveDef) {
  const list = [...wd.enemies];
  // every lap brings one more enemy to each wave (never another general)
  const crowd = wd.enemies.filter((e) => DEFS[e.def].kind !== 'boss');
  for (let k = 0; k < w.lap && crowd.length; k++) {
    const t = crowd[k % crowd.length];
    list.push({ def: t.def, side: k % 2 ? ((-t.side) as 1 | -1) : t.side, y: clamp(t.y + ((k * 37) % 50) - 25, GROUND_MIN, GROUND_MAX), dx: 40 + 22 * k });
  }
  const mul = lapMul(w);
  for (const e of list) {
    const dx = e.dx ?? 0;
    const x = e.side > 0 ? w.cam + SCREEN_W + 14 + dx : w.cam - 14 - dx;
    const f = mkFighter(w, e.def, -1, x, e.y);
    f.maxHp = Math.round(f.maxHp * mul);
    f.hp = f.maxHp;
    f.face = e.side > 0 ? -1 : 1;
    f.cd = 40 + Math.floor(rand(w) * 60);
    w.fighters.push(f);
  }
  for (const it of wd.items ?? []) {
    w.items.push({ id: w.nextId++, kind: it.kind, x: it.x, y: it.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: WEAPONS[it.kind]?.uses ?? 0 });
  }
}

function updateStage(w: World) {
  const waves = STAGE.waves;

  for (const s of w.slots) {
    if (!s.a) continue;
    const f = byId(w, s.fid);
    if (f && f.st === St.Dead) {
      s.rt++;
      if (s.rt >= 90 && s.lives > 0) {
        f.hp = f.maxHp;
        f.x = w.cam + 40 + f.slot * 30;
        f.y = 170 + f.slot * 14;
        f.z = 0;
        f.vx = f.vy = f.vz = 0;
        f.inv = 90;
        f.combo = 0;
        setSt(f, St.Idle);
      }
    }
  }

  const alive = w.fighters.filter((f) => isPlayer(f) && f.st !== St.Dead);
  if (alive.length) {
    const avg = alive.reduce((n, f) => n + f.x, 0) / alive.length;
    const target = clamp(avg - SCREEN_W / 2 + 20, 0, w.camMax);
    if (target > w.cam) w.cam = Math.min(target, w.cam + 2);
  }

  if (w.status === 0) {
    if (!w.locked && w.wave < waves.length && w.stageT >= 60 && w.cam >= waves[w.wave].at - 0.5) {
      spawnWave(w, waves[w.wave]);
      w.locked = true;
      w.camMax = waves[w.wave].at;
    } else if (w.locked && !w.fighters.some((f) => !isPlayer(f))) {
      w.locked = false;
      w.wave++;
      w.camMax = w.wave < waves.length ? waves[w.wave].at : STAGE_W - SCREEN_W;
    }
    if (!w.locked && w.wave >= waves.length && ++w.lapT >= LAP_DELAY) nextLap(w);
    const act = w.slots.filter((s) => s.a);
    if (act.length && act.every((s) => s.lives <= 0)) {
      w.status = 2;
      w.statusT = 0;
    }
  } else {
    w.statusT++;
    if (w.statusT >= 420) resetWorld(w);
  }
}

/**
 * The stage never ends: once the general and the last wave are down, everything (heroes, items lying around, shots) slides
 * back by one stage length and the first wave comes again. Lives, score, weapons and cooldowns carry over.
 */
function nextLap(w: World) {
  const shift = w.cam;
  for (const f of w.fighters) {
    f.x = Math.max(0, f.x - shift);
    f.haloX -= shift;
  }
  for (const it of w.items) it.x = Math.max(0, it.x - shift);
  for (const s of w.shots) s.x -= shift;
  w.ev.length = 0;
  w.cam = 0;
  w.camMax = STAGE.waves[0].at;
  w.wave = 0;
  w.locked = false;
  w.stageT = 0;
  w.lapT = 0;
  w.lap++;
}

/** The 1UP and the tonic are taken just by walking over them. */
function pickUpWalkOvers(w: World) {
  for (const it of w.items) {
    if ((it.kind !== ITEM_1UP && it.kind !== ITEM_TONIC) || it.z > 1) continue;
    const p = w.fighters.find((f) => isPlayer(f) && f.hp > 0 && f.st !== St.Dead && Math.abs(f.x - it.x) <= 16 && Math.abs(f.y - it.y) <= 12);
    if (!p) continue;
    if (it.kind === ITEM_1UP) {
      const s = w.slots[p.slot];
      if (s) s.lives = Math.min(MAX_LIVES, s.lives + 1);
    } else {
      p.maxHp += TONIC_BONUS;
      p.hp += TONIC_BONUS;
      p.mpMax += TONIC_BONUS;
    }
    it.kind = 0;
    w.ev.push([it.x, it.y, 14, 1]);
  }
  w.items = w.items.filter((it) => it.kind !== 0);
}

// ---------- snapshot ----------

const r1 = (n: number) => Math.round(n * 10) / 10;

export function snapshot(w: World): Snapshot {
  const snap: Snapshot = {
    n: w.tick,
    c: r1(w.cam),
    s: w.status,
    wv: w.wave,
    wt: STAGE.waves.length,
    lk: w.locked ? 1 : 0,
    lp: w.lap,
    sl: w.slots.map((s) => ({ a: s.a, l: s.lives, p: s.score, f: s.fid })),
    f: w.fighters.map((f) => ({
      i: f.id,
      d: f.def,
      x: r1(f.x),
      y: r1(f.y),
      z: r1(f.z),
      r: f.face,
      s: f.st,
      t: f.t,
      h: r1(f.hp),
      m: f.maxHp,
      em: f.mpMax,
      w: f.weapon,
      v: f.inv,
      e: Math.round(f.mp),
      n: f.wn,
      c: f.cast,
      ht: f.heatCd > 0 ? 500 + Math.ceil(f.heatCd / 60) : f.heat,
      b: (f.storm > 0 ? 16 : 0) | (f.aura > 0 ? 1 : 0) | (f.shield > 0 ? 2 : 0) | (f.halo > 0 ? 4 : 0) | ((f.aura > 0 && f.aura < 120) || (f.shield > 0 && f.shield < 120) ? 8 : 0),
      k: f.kind === 'player' ? f.sp.slice() : [],
      hl: f.halo > 0 ? [r1(f.haloX), r1(f.haloY), f.halo] : [],
    })),
    it: w.items.map((i) => ({ i: i.id, k: i.kind, x: r1(i.x), y: r1(i.y), z: r1(i.z) })),
    sh: w.shots.map((s) => ({ k: s.kind, x: r1(s.x), y: r1(s.y), z: r1(s.z), r: (s.vx >= 0 ? 1 : -1) as 1 | -1 })),
    ev: w.ev.map((e) => [r1(e[0]), r1(e[1]), r1(e[2]), e[3]] as Snapshot['ev'][number]),
  };
  w.ev.length = 0;
  return snap;
}
