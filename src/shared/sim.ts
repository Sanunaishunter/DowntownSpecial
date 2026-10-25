import { Btn, GRAVITY, GROUND_MAX, GROUND_MIN, JUMP_V, MAX_PLAYERS, SCREEN_W, STAGE_W } from './constants';
import { DEFS, PLAYER_DEFS } from './defs';
import { STAGE, type WaveDef } from './stage';
import { St, type Fighter, type PlayerInput, type Snapshot, type World } from './types';

const PEND_WINDOW = 3;
const UPPER_WINDOW = 12;
const AB = Btn.A | Btn.B;
const HOLD_Z = 34;

interface AtkDef {
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

const ATK: Record<number, AtkDef> = {
  [St.Punch]: { start: 2, active: 3, total: 12, dmg: 6, reach: 20, kbx: 1.0, knock: false, launch: 0, stun: 20 },
  [St.Kick]: { start: 5, active: 4, total: 20, dmg: 9, reach: 25, kbx: 1.5, knock: true, launch: 2.2, stun: 0 },
  [St.AirKick]: { start: 3, active: 999, total: 999, dmg: 8, reach: 22, kbx: 1.6, knock: true, launch: 2.0, stun: 0 },
  [St.Dash]: { start: 2, active: 24, total: 32, dmg: 10, reach: 20, kbx: 2.0, knock: true, launch: 2.4, stun: 0 },
  [St.Upper]: { start: 1, active: 12, total: 999, dmg: 12, reach: 16, kbx: 0.6, knock: true, launch: 3.2, stun: 0 },
  [St.Swing]: { start: 5, active: 4, total: 22, dmg: 14, reach: 34, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
  [St.HoldSwing]: { start: 6, active: 5, total: 24, dmg: 12, reach: 30, kbx: 1.8, knock: true, launch: 2.4, stun: 0 },
  [St.Stomp]: { start: 4, active: 3, total: 20, dmg: 8, reach: 14, kbx: 0, knock: false, launch: 0, stun: 0 },
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
    ev: [],
    cam: 0,
    camMax: STAGE.waves[0].at,
    wave: 0,
    locked: false,
    status: 0,
    statusT: 0,
    slots: Array.from({ length: MAX_PLAYERS }, () => ({ a: 0 as const, lives: 3, score: 0, fid: 0, rt: 0 })),
  };
}

export function resetWorld(w: World) {
  const active = w.slots.map((s) => s.a);
  w.stageT = 0;
  w.fighters = [];
  w.items = [];
  w.ev = [];
  w.cam = 0;
  w.camMax = STAGE.waves[0].at;
  w.wave = 0;
  w.locked = false;
  w.status = 0;
  w.statusT = 0;
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
  w.fighters = w.fighters.filter((f) => !(!isPlayer(f) && f.st === St.Dead && f.t >= 40));
  updateStage(w);
}

// ---------- player ----------

function updatePlayer(w: World, f: Fighter, inp: PlayerInput | undefined) {
  const held = inp?.held ?? 0;
  const pressed = inp?.pressed ?? 0;
  const d = DEFS[f.def];
  if (f.inv > 0) f.inv--;
  if (f.tapT > 0) f.tapT--;

  const act = f.st === St.Idle || f.st === St.Walk || f.st === St.Run || f.st === St.Jump || f.st === St.Hold;
  const dx = (held & Btn.Right ? 1 : 0) - (held & Btn.Left ? 1 : 0);
  const dy = (held & Btn.Down ? 1 : 0) - (held & Btn.Up ? 1 : 0);

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
    if (pressed & (Btn.Left | Btn.Right)) {
      const dir = pressed & Btn.Right ? 1 : -1;
      if (grounded && f.st !== St.Hold && f.tapDir === dir && f.tapT > 0) {
        setSt(f, St.Run);
        f.face = dir;
        f.tapT = 0;
      } else {
        f.tapDir = dir;
        f.tapT = 15;
      }
    }

    if (f.st === St.Idle || f.st === St.Walk) {
      if (dx || dy) {
        f.st = St.Walk;
        f.vx = dx * d.walk;
        f.vy = dy * d.walk * 0.7;
        if (dx) f.face = dx > 0 ? 1 : -1;
      } else {
        f.st = St.Idle;
        f.vx = 0;
        f.vy = 0;
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
  updateBody(w, f);
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
    if (a) {
      setSt(f, St.Swing);
    } else {
      throwWeapon(w, f);
    }
    f.vx = 0;
    f.vy = 0;
    return;
  }
  const it = nearestItem(w, f);
  if (it) {
    w.items = w.items.filter((x) => x !== it);
    f.weapon = it.kind;
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
    setSt(f, St.Dash);
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
    if (it.owner || it.z > 1) continue;
    if (Math.abs(it.x - f.x) <= 16 && Math.abs(it.y - f.y) <= 9) return it;
  }
  return undefined;
}

function throwWeapon(w: World, f: Fighter) {
  setSt(f, St.Throw);
  w.items.push({
    id: w.nextId++,
    kind: f.weapon,
    x: f.x + f.face * 8,
    y: f.y,
    z: f.z + 14,
    vx: f.face * 4.2,
    vy: 0,
    vz: 0.8,
    owner: f.slot + 1,
  });
  f.weapon = 0;
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
  if (e.st === St.Idle || e.st === St.Walk) {
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
        setSt(f, St.Idle);
      }
      break;
    case St.Punch:
    case St.Kick:
    case St.Swing:
    case St.Stomp:
    case St.Pick:
    case St.Throw:
      f.vx = 0;
      f.vy = 0;
      if (f.t >= (ATK[f.st]?.total ?? (f.st === St.Pick ? 10 : 12))) setSt(f, St.Idle);
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
  } else if (f.lastSlot >= 0 && w.slots[f.lastSlot]) {
    w.slots[f.lastSlot].score += DEFS[f.def].score;
  }
}

// ---------- combat ----------

function hit(w: World, t: Fighter, srcSlot: number, dmg: number, kbx: number, knock: boolean, launch: number, dir: number) {
  if (t.holding) dropHeld(w, t);
  t.pend = 0;
  t.pendT = 0;
  t.hp = Math.max(0, t.hp - dmg);
  if (srcSlot >= 0) t.lastSlot = srcSlot;
  t.combo++;
  const down = t.hp <= 0 || knock || t.combo >= 3 || t.z > 0;
  t.face = dir > 0 ? -1 : 1;
  if (down) {
    if (t.weapon) {
      w.items.push({ id: w.nextId++, kind: t.weapon, x: t.x, y: t.y, z: t.z, vx: 0, vy: 0, vz: 0, owner: 0 });
      t.weapon = 0;
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
    const atk = ATK[a.st];
    if (!atk || a.heldBy) continue;
    if (a.t < atk.start || a.t >= atk.start + atk.active) continue;
    if (a.st === St.HoldSwing && a.t === atk.start) {
      const e = byId(w, a.holding);
      if (e) e.hp = Math.max(1, e.hp - 6);
    }
    const mul = DEFS[a.def].dmg;
    for (const t of w.fighters) {
      if (t === a || t.heldBy || isPlayer(t) === isPlayer(a)) continue;
      if (a.hits.includes(t.id)) continue;
      if (a.st === St.Stomp) {
        if (t.st !== St.Down || t.z > 0) continue;
      } else if (!vulnerable(t)) continue;
      const rx = (t.x - a.x) * a.face;
      if (rx < -6 || rx > atk.reach + 6) continue;
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
        hit(w, t, a.slot, dmg, atk.kbx, atk.knock, atk.launch, a.face);
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
          hit(w, t, it.owner - 1, 12, 1.8, true, 2.2, it.vx >= 0 ? 1 : -1);
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

// ---------- stage ----------

function spawnWave(w: World, wd: WaveDef) {
  for (const e of wd.enemies) {
    const dx = e.dx ?? 0;
    const x = e.side > 0 ? w.cam + SCREEN_W + 14 + dx : w.cam - 14 - dx;
    const f = mkFighter(w, e.def, -1, x, e.y);
    f.face = e.side > 0 ? -1 : 1;
    f.cd = 40 + Math.floor(rand(w) * 60);
    w.fighters.push(f);
  }
  for (const it of wd.items ?? []) {
    w.items.push({ id: w.nextId++, kind: it.kind, x: it.x, y: it.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0 });
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
      if (w.wave >= waves.length) {
        w.status = 1;
        w.statusT = 0;
      }
    }
    const act = w.slots.filter((s) => s.a);
    if (act.length && act.every((s) => s.lives <= 0)) {
      w.status = 2;
      w.statusT = 0;
    }
  } else {
    w.statusT++;
    if (w.statusT >= (w.status === 1 ? 600 : 420)) resetWorld(w);
  }
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
      h: f.hp,
      m: f.maxHp,
      w: f.weapon,
      v: f.inv,
    })),
    it: w.items.map((i) => ({ i: i.id, k: i.kind, x: r1(i.x), y: r1(i.y), z: r1(i.z) })),
    ev: w.ev.map((e) => [r1(e[0]), r1(e[1]), r1(e[2]), e[3]] as Snapshot['ev'][number]),
  };
  w.ev.length = 0;
  return snap;
}
