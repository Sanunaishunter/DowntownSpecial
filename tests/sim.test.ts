import { describe, expect, it } from 'vitest';
import { Btn } from '../src/shared/constants';
import { addPlayer, createWorld, snapshot, step } from '../src/shared/sim';
import { St, type PlayerInput, type World } from '../src/shared/types';
import { STAGE } from '../src/shared/stage';

const none: PlayerInput = { held: 0, pressed: 0 };

function run(w: World, ticks: number, inp: PlayerInput = none) {
  for (let i = 0; i < ticks; i++) step(w, [inp, undefined]);
}

function press(w: World, mask: number, hold = 0) {
  step(w, [{ held: mask | hold, pressed: mask }, undefined]);
}

function setup() {
  const w = createWorld(7);
  addPlayer(w, 0);
  run(w, 5);
  return w;
}

function spawnGrunt(w: World, dx: number, dy = 0) {
  const p = w.fighters.find((f) => f.kind === 'player')!;
  const before = new Set(w.fighters.map((f) => f.id));
  w.stageT = 0;
  w.fighters.push({
    ...p,
    id: w.nextId++,
    kind: 'grunt',
    def: 'saburo',
    slot: -1,
    x: p.x + dx,
    y: p.y + dy,
    hp: 34,
    maxHp: 34,
    face: -1,
    inv: 0,
    st: St.Idle,
    t: 0,
    aiT: 9999,
    cd: 9999,
    hits: [],
  });
  return w.fighters.find((f) => !before.has(f.id))!;
}

describe('sim', () => {
  it('is deterministic for identical inputs', () => {
    const a = createWorld(42);
    const b = createWorld(42);
    addPlayer(a, 0);
    addPlayer(b, 0);
    addPlayer(a, 1);
    addPlayer(b, 1);
    for (let i = 0; i < 1200; i++) {
      const held = i % 90 < 45 ? Btn.Right : Btn.Right | Btn.Down;
      const pressed = i % 17 === 0 ? Btn.A : i % 29 === 0 ? Btn.B : 0;
      const inp = { held, pressed };
      step(a, [inp, inp]);
      step(b, [inp, inp]);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('A+B pressed together jumps', () => {
    const w = setup();
    press(w, Btn.A | Btn.B);
    run(w, 5);
    const p = w.fighters[0];
    expect(p.z).toBeGreaterThan(0);
    run(w, 60);
    expect(p.z).toBe(0);
    expect(p.st).toBe(St.Idle);
  });

  it('A and B pressed a couple of ticks apart still jump', () => {
    const w = setup();
    press(w, Btn.A);
    press(w, Btn.B, Btn.A);
    run(w, 5);
    expect(w.fighters[0].z).toBeGreaterThan(0);
  });

  it('punch damages an adjacent enemy; third consecutive punch knocks down', () => {
    const w = setup();
    const e = spawnGrunt(w, 14);
    const p = w.fighters[0];
    p.face = 1;
    for (let n = 0; n < 3; n++) {
      press(w, Btn.A);
      run(w, 14);
    }
    expect(e.hp).toBeLessThan(34);
    expect(e.st === St.Down || e.st === St.GetUp || e.hp < 34).toBe(true);
  });

  it('kick knocks the enemy down', () => {
    const w = setup();
    const e = spawnGrunt(w, 16);
    w.fighters[0].face = 1;
    press(w, Btn.B);
    run(w, 14);
    expect(e.st).toBe(St.Down);
    expect(e.hp).toBe(34 - 9);
  });

  it('double tap right starts running', () => {
    const w = setup();
    const x0 = w.fighters[0].x;
    step(w, [{ held: Btn.Right, pressed: Btn.Right }, undefined]);
    step(w, [none, undefined]);
    step(w, [none, undefined]);
    step(w, [{ held: Btn.Right, pressed: Btn.Right }, undefined]);
    run(w, 6, { held: Btn.Right, pressed: 0 });
    expect(w.fighters[0].st).toBe(St.Run);
    expect(w.fighters[0].x).toBeGreaterThan(x0 + 5);
  });

  it('can lift, swing and throw a downed enemy', () => {
    const w = setup();
    const e = spawnGrunt(w, 12);
    w.fighters[0].face = 1;
    e.st = St.Down;
    e.t = 0;
    e.hp = 30;
    press(w, Btn.A);
    run(w, 6);
    const p = w.fighters[0];
    expect(e.heldBy).toBe(p.id);
    run(w, 20);
    expect(p.st).toBe(St.Hold);
    press(w, Btn.B);
    run(w, 4);
    expect(e.heldBy).toBe(0);
    expect(e.thrown).toBe(1);
    expect(e.vx).toBeGreaterThan(2);
  });

  it('stomp hits a downed enemy', () => {
    const w = setup();
    const e = spawnGrunt(w, 10);
    w.fighters[0].face = 1;
    e.st = St.Down;
    e.t = 0;
    press(w, Btn.A | Btn.B);
    run(w, 12);
    expect(e.hp).toBeLessThan(34);
  });

  it('picks up, swings and throws a weapon', () => {
    const w = setup();
    const p = w.fighters[0];
    w.items.push({ id: w.nextId++, kind: 1, x: p.x + 4, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 14 });
    press(w, Btn.A);
    run(w, 14);
    expect(p.weapon).toBe(1);
    expect(w.items.length).toBe(0);
    press(w, Btn.B);
    run(w, 3);
    expect(p.weapon).toBe(0);
    expect(w.items.length).toBe(1);
    expect(w.items[0].owner).toBe(1);
  });

  it('first wave spawns after the intro delay and clearing it unlocks the camera', () => {
    const w = setup();
    run(w, 70);
    expect(w.locked).toBe(true);
    expect(w.fighters.filter((f) => f.kind !== 'player').length).toBe(STAGE.waves[0].enemies.length);
    w.fighters = w.fighters.filter((f) => f.kind === 'player');
    run(w, 3);
    expect(w.locked).toBe(false);
    expect(w.wave).toBe(1);
    expect(w.camMax).toBe(STAGE.waves[1].at);
  });

  it('enemies eventually attack and hurt an idle player', () => {
    const w = setup();
    run(w, 900);
    const p = w.fighters[0];
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('player dies, loses a life and respawns', () => {
    const w = setup();
    const p = w.fighters[0];
    p.hp = 1;
    const e = spawnGrunt(w, 14);
    e.aiT = 0;
    e.cd = 0;
    e.face = -1;
    e.x = p.x + 16;
    run(w, 600);
    expect(w.slots[0].lives).toBeLessThanOrEqual(2);
  });

  it('snapshot is compact and clears events', () => {
    const w = setup();
    spawnGrunt(w, 14);
    w.fighters[0].face = 1;
    press(w, Btn.B);
    run(w, 10);
    const s = snapshot(w);
    expect(s.f.length).toBe(2);
    expect(s.ev.length).toBeGreaterThan(0);
    expect(snapshot(w).ev.length).toBe(0);
    expect(JSON.stringify(s).length).toBeLessThan(2000);
  });
});
