import { describe, expect, it } from 'vitest';
import { Btn } from '../src/shared/constants';
import { addPlayer, createWorld, snapshot, step } from '../src/shared/sim';
import { BEAM, MP_MAX, VOLLEY } from '../src/shared/specials';
import { St, type Fighter, type PlayerInput, type World } from '../src/shared/types';
import { WEAPONS, WID } from '../src/shared/weapons';

const none: PlayerInput = { held: 0, pressed: 0 };

function setup() {
  const w = createWorld(11);
  addPlayer(w, 0);
  for (let i = 0; i < 5; i++) step(w, [none, undefined]);
  w.stageT = -100000;
  return w;
}

function player(w: World) {
  return w.fighters.find((f) => f.kind === 'player')!;
}

function foe(w: World, dx: number, dy = 0, def = 'saburo', kind: Fighter['kind'] = 'grunt', hp = 34): Fighter {
  const p = player(w);
  const f: Fighter = {
    ...p,
    id: w.nextId++,
    kind,
    def,
    slot: -1,
    x: p.x + dx,
    y: p.y + dy,
    hp,
    maxHp: hp,
    face: -1,
    inv: 0,
    st: St.Idle,
    t: 0,
    aiT: 99999,
    cd: 99999,
    hits: [],
    weapon: 0,
    wn: 0,
    mp: 0,
    volley: 0,
    cast: 0,
  };
  w.fighters.push(f);
  return f;
}

function run(w: World, n: number, inp: PlayerInput = none) {
  for (let i = 0; i < n; i++) step(w, [inp, undefined]);
}

function press(w: World, mask: number, hold = 0) {
  step(w, [{ held: mask | hold, pressed: mask }, undefined]);
}

function give(w: World, weapon: number, wn = WEAPONS[weapon].uses) {
  const p = player(w);
  p.weapon = weapon;
  p.wn = wn;
  p.face = 1;
  return p;
}

describe('energy', () => {
  it('builds up when you land hits and caps at the maximum', () => {
    const w = setup();
    const e = foe(w, 14, 0, 'saburo', 'grunt', 9999);
    player(w).face = 1;
    press(w, Btn.A);
    run(w, 14);
    const after1 = player(w).mp;
    expect(after1).toBeGreaterThan(0);
    for (let i = 0; i < 40 && player(w).mp < MP_MAX; i++) {
      e.st = St.Idle;
      e.inv = 0;
      e.x = player(w).x + 14;
      press(w, Btn.B);
      run(w, 24);
    }
    expect(player(w).mp).toBe(MP_MAX);
  });

  it('does not build while hits come from a special move', () => {
    const w = setup();
    const p = player(w);
    p.mp = MP_MAX;
    p.face = 1;
    foe(w, 60, 0, 'saburo', 'grunt', 9999);
    press(w, Btn.S1);
    run(w, 100);
    expect(p.st).toBe(St.Beam);
    expect(p.mp).toBeLessThan(MP_MAX);
  });
});

describe('beam special', () => {
  it('needs a full meter', () => {
    const w = setup();
    player(w).mp = MP_MAX - 1;
    press(w, Btn.S1);
    run(w, 5);
    expect(player(w).st).not.toBe(St.Beam);
  });

  it('roots the player, pins and damages enemies in line, then ends', () => {
    const w = setup();
    const p = player(w);
    p.mp = MP_MAX;
    p.face = 1;
    const near = foe(w, 60, 0, 'saburo', 'grunt', 200);
    const off = foe(w, 60, 30, 'saburo', 'grunt', 200);
    const x0 = p.x;
    press(w, Btn.S1);
    expect(p.st).toBe(St.Beam);
    run(w, BEAM.charge + 100, { held: Btn.Right | Btn.Down, pressed: 0 });
    expect(p.x).toBe(x0);
    expect(near.hp).toBeLessThan(200);
    expect(near.st).toBe(St.Hurt);
    expect(off.hp).toBe(200);
    run(w, BEAM.fire);
    expect(p.st).toBe(St.Idle);
    expect(p.mp).toBe(0);
    const dealt = 200 - near.hp;
    expect(dealt).toBeGreaterThanOrEqual(BEAM.dmg * (BEAM.fire / BEAM.pulse) * 0.9);
  });

  it('makes the caster untouchable while firing', () => {
    const w = setup();
    const p = player(w);
    p.mp = MP_MAX;
    p.face = 1;
    const e = foe(w, -14, 0, 'saburo', 'grunt', 100);
    e.face = 1;
    e.aiT = 0;
    e.cd = 0;
    press(w, Btn.S1);
    run(w, 200);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('fist volley special', () => {
  it('fires ten shots while the player stays free to move', () => {
    const w = setup();
    const p = player(w);
    p.mp = MP_MAX;
    p.face = 1;
    const seen = new Set<number>();
    const x0 = p.x;
    press(w, Btn.S2);
    for (let i = 0; i < VOLLEY.shots * VOLLEY.gap + 20; i++) {
      step(w, [{ held: Btn.Down, pressed: 0 }, undefined]);
      for (const s of w.shots) seen.add(s.id);
    }
    expect(seen.size).toBe(VOLLEY.shots);
    expect(p.y).toBeGreaterThan(170);
    expect(p.x).toBe(x0);
    expect(p.mp).toBe(0);
    expect(p.volley).toBe(0);
  });

  it('knocks enemies down and is cancelled when the caster is knocked down', () => {
    const w = setup();
    const p = player(w);
    p.mp = MP_MAX;
    p.face = 1;
    const e = foe(w, 90, 0, 'saburo', 'grunt', 100);
    press(w, Btn.S2);
    run(w, 60);
    expect(e.hp).toBeLessThan(100);
    p.volley = 5;
    p.mp = 50;
    p.st = St.Down;
    run(w, 3);
    expect(p.volley).toBe(0);
    expect(p.mp).toBe(0);
  });
});

describe('weapons', () => {
  it('pickup keeps the remaining uses of the item', () => {
    const w = setup();
    const p = player(w);
    w.items.push({ id: w.nextId++, kind: WID.Bamboo, x: p.x + 4, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 7 });
    press(w, Btn.A);
    run(w, 14);
    expect(p.weapon).toBe(WID.Bamboo);
    expect(p.wn).toBe(7);
  });

  it('breaks after its last hit', () => {
    const w = setup();
    const p = give(w, WID.Stick, 1);
    foe(w, 24, 0, 'saburo', 'grunt', 200);
    press(w, Btn.A);
    run(w, 30);
    expect(p.weapon).toBe(0);
  });

  it('a lightsaber swing cuts every enemy in reach', () => {
    const w = setup();
    give(w, WID.Saber);
    const a = foe(w, 20, 0, 'saburo', 'grunt', 100);
    const b = foe(w, 36, 2, 'saburo', 'grunt', 100);
    press(w, Btn.A);
    run(w, 24);
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
  });

  it('stone: B throws it as a heavy projectile, A smashes', () => {
    const w = setup();
    const p = give(w, WID.Stone);
    const e = foe(w, 50, 0, 'saburo', 'grunt', 100);
    press(w, Btn.B);
    run(w, 30);
    expect(p.weapon).toBe(0);
    expect(e.hp).toBeLessThanOrEqual(100 - WEAPONS[WID.Stone].throwDmg);
    const q = give(w, WID.Stone);
    const e2 = foe(w, 18, 0, 'saburo', 'grunt', 100);
    press(w, Btn.A);
    run(w, 30);
    expect(q.weapon).toBe(WID.Stone);
    expect(e2.hp).toBeLessThan(100);
  });

  it('a blade cannot be thrown: B swings it instead', () => {
    const w = setup();
    const p = give(w, WID.Saber);
    press(w, Btn.B);
    run(w, 4);
    expect(p.weapon).toBe(WID.Saber);
    expect(w.items.length).toBe(0);
  });

  it('rifle: A shoots, spends ammo, hits at range, and the empty gun disappears', () => {
    const w = setup();
    const p = give(w, WID.Rifle, 2);
    const e = foe(w, 120, 0, 'saburo', 'grunt', 100);
    press(w, Btn.A, 0);
    run(w, 30);
    expect(p.wn).toBe(1);
    expect(e.hp).toBeLessThan(100);
    press(w, Btn.A);
    run(w, 40);
    expect(p.wn).toBe(0);
    expect(p.weapon).toBe(0);
  });

  it('rifle: holding A keeps firing', () => {
    const w = setup();
    const p = give(w, WID.Rifle, 30);
    press(w, Btn.A);
    run(w, 80, { held: Btn.A, pressed: 0 });
    expect(p.wn).toBeLessThanOrEqual(30 - 4);
  });

  it('rifle: B bashes in melee without using ammo', () => {
    const w = setup();
    const p = give(w, WID.Rifle, 10);
    const e = foe(w, 18, 0, 'saburo', 'grunt', 100);
    press(w, Btn.B);
    run(w, 24);
    expect(e.hp).toBeLessThan(100);
    expect(p.wn).toBe(10);
  });
});

describe('drops', () => {
  it('a defeated boss always drops a strong weapon', () => {
    const w = setup();
    const boss = foe(w, 100, 0, 'shogun', 'boss', 10);
    boss.hp = 0;
    boss.st = St.Down;
    boss.t = 44;
    boss.lastSlot = 0;
    run(w, 4);
    expect(w.items.length).toBe(1);
    expect([WID.Saber, WID.Rifle]).toContain(w.items[0].kind);
    expect(w.items[0].n).toBe(WEAPONS[w.items[0].kind].uses);
  });

  it('grunts sometimes drop a weapon', () => {
    let drops = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = createWorld(seed);
      addPlayer(w, 0);
      for (let i = 0; i < 5; i++) step(w, [none, undefined]);
      w.stageT = -100000;
      const g = foe(w, 100, 0, 'saburo', 'grunt', 10);
      g.hp = 0;
      g.st = St.Down;
      g.t = 44;
      for (let i = 0; i < 4; i++) step(w, [none, undefined]);
      drops += w.items.length;
    }
    expect(drops).toBeGreaterThan(5);
    expect(drops).toBeLessThan(30);
  });
});

describe('snapshot', () => {
  it('reports energy, ammo, cast and shots', () => {
    const w = setup();
    const p = give(w, WID.Rifle, 12);
    p.mp = 40;
    press(w, Btn.A);
    run(w, 6);
    const s = snapshot(w);
    const me = s.f.find((f) => f.i === p.id)!;
    expect(me.e).toBe(40);
    expect(me.n).toBeLessThanOrEqual(11);
    expect(s.sh.length).toBeGreaterThan(0);
  });
});
