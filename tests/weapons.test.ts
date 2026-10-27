import { COMBO, CRIT, CRY, CRY_TEXT, EV_CRIT, EV_DAMAGE } from '../src/shared/feel';
import { describe, expect, it } from 'vitest';
import { Btn } from '../src/shared/constants';
import { addPlayer, createWorld, enterOnsen, hit, snapshot, step } from '../src/shared/sim';
import { AURA, BARRAGE, BEAM, ENEMY_HALO, HALO, MP_MAX, SHIELD, SP, SPECIALS, TATSU, THUNDER, VOLLEY } from '../src/shared/specials';
import { St, type Fighter, type GameEvent, type PlayerInput, type World } from '../src/shared/types';
import { GATLING, ITEM_1UP, ITEM_TONIC, TWIN, WEAPONS, WID } from '../src/shared/weapons';
import { DEFS } from '../src/shared/defs';
import { STAGE } from '../src/shared/stage';
import { ONSEN, STAGE_ONSEN, STAGE_TOKAIDO } from '../src/shared/onsen';

// exact damage numbers in these tests: no critical hits unless a test asks for them
CRIT.chance = 0;

const none: PlayerInput = { held: 0, pressed: 0 };

function setup(seed = 11) {
  const w = createWorld(seed);
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
    sp: [0, 0, 0, 0, 0, 0],
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

describe('special meter', () => {
  it('stays empty while you land hits', () => {
    const w = setup();
    foe(w, 14, 0, 'saburo', 'grunt', 9999);
    player(w).face = 1;
    press(w, Btn.A);
    run(w, 14);
    press(w, Btn.B);
    run(w, 24);
    expect(player(w).mp).toBe(0);
  });

  it('only shows how much of a running special is left', () => {
    const w = setup();
    const p = player(w);
    p.face = 1;
    foe(w, 60, 0, 'saburo', 'grunt', 9999);
    press(w, Btn.S1);
    run(w, 100);
    expect(p.st).toBe(St.Beam);
    expect(p.mp).toBeGreaterThan(0);
    expect(p.mp).toBeLessThan(MP_MAX);
  });
});

describe('beam special', () => {
  it('roots the player, pins and damages enemies in line, then ends', () => {
    const w = setup();
    const p = player(w);
    p.face = 1;
    const near = foe(w, 60, 0, 'saburo', 'grunt', 200);
    near.sp[SP.Halo] = 99999; // measure the beam alone, no self-healing
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

  it('B throws away whatever is held, so another weapon can be picked up', () => {
    for (const id of [WID.Stick, WID.Bamboo, WID.Stone, WID.Saber, WID.Rifle, WID.Gatling]) {
      const w = setup();
      const p = give(w, id, 7);
      press(w, Btn.B);
      run(w, 30);
      expect(p.weapon).toBe(0);
      const it = w.items.find((i) => i.kind === id)!;
      expect(it.n).toBe(7);
      expect(it.z).toBe(0);
    }
    const w = setup();
    const p = give(w, WID.Saber);
    press(w, Btn.B);
    run(w, 30);
    w.items.push({ id: w.nextId++, kind: WID.Bamboo, x: p.x + 4, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 9 });
    press(w, Btn.A);
    run(w, 14);
    expect(p.weapon).toBe(WID.Bamboo);
    expect(p.wn).toBe(9);
  });

  it('a thrown blade or gun only lands; it does not hurt', () => {
    const w = setup();
    give(w, WID.Saber);
    const e = foe(w, 30, 0, 'saburo', 'grunt', 100);
    press(w, Btn.B);
    run(w, 40);
    expect(e.hp).toBe(100);
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

  it('rifle: an empty magazine still bashes with A', () => {
    const w = setup();
    const p = give(w, WID.Rifle, 0);
    const e = foe(w, 18, 0, 'saburo', 'grunt', 100);
    press(w, Btn.A);
    run(w, 24);
    expect(e.hp).toBeLessThan(100);
    expect(p.wn).toBe(0);
  });
});

describe('drops', () => {
  it('a defeated boss always drops a strong weapon and a 1UP', () => {
    const w = setup();
    const boss = foe(w, 100, 0, 'shogun', 'boss', 10);
    boss.hp = 0;
    boss.st = St.Down;
    boss.t = 44;
    boss.lastSlot = 0;
    run(w, 4);
    expect(w.items.length).toBe(2);
    const gun = w.items.find((i) => i.kind !== ITEM_1UP)!;
    expect([WID.Saber, WID.Rifle, WID.Gatling, WID.Twin]).toContain(gun.kind);
    expect(gun.n).toBe(WEAPONS[gun.kind].uses);
    expect(w.items.filter((i) => i.kind === ITEM_1UP).length).toBe(1);
  });

  it('every kind of weapon can drop from an ordinary enemy', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) {
      const w = createWorld(seed);
      addPlayer(w, 0);
      for (let i = 0; i < 5; i++) step(w, [none, undefined]);
      w.stageT = -100000;
      const g = foe(w, 100, 0, 'saburo', 'grunt', 10);
      g.hp = 0;
      g.st = St.Down;
      g.t = 44;
      for (let i = 0; i < 4; i++) step(w, [none, undefined]);
      for (const it of w.items) if (it.kind !== ITEM_TONIC) seen.add(it.kind);
    }
    expect([...seen].sort()).toEqual([WID.Stick, WID.Bamboo, WID.Stone, WID.Saber, WID.Rifle, WID.Gatling, WID.Twin]);
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
      drops += w.items.filter((it) => it.kind !== ITEM_TONIC).length;
    }
    // about a third of 60 grunts
    expect(drops).toBeGreaterThan(10);
    expect(drops).toBeLessThan(32);
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

// Which special started (read from what it set going).
function fired(p: Fighter) {
  const ids: number[] = [];
  if (p.st === St.Beam) ids.push(SP.Beam);
  if (p.volley > 0) ids.push(SP.Volley);
  if (p.halo > 0) ids.push(SP.Halo);
  if (p.aura > 0) ids.push(SP.Aura);
  if (p.shield > 0) ids.push(SP.Shield);
  return ids;
}

describe('special buttons', () => {
  it('every special is ready at the start and nothing fires by itself', () => {
    const w = setup();
    const p = player(w);
    expect(p.sp).toEqual([0, 0, 0, 0, 0, 0]);
    p.hp = 10;
    run(w, 300);
    expect(fired(p)).toEqual([]);
  });

  it('cooldown in seconds is the skill power divided by 90', () => {
    for (const s of SPECIALS) expect(s.cooldown).toBe(Math.round((s.power / 90) * 60));
    expect(SPECIALS.map((s) => s.cooldown / 60)).toEqual([20, 15, 30, 40, 30, 80]);
  });

  it('each button fires its own special and starts only its own cooldown', () => {
    SPECIALS.slice(0, 5).forEach((s) => {
      const w = setup();
      const p = player(w);
      press(w, s.bit);
      expect(fired(p)).toEqual([s.id]);
      expect(p.sp.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0)).toEqual([s.id]);
      expect(p.sp[s.id]).toBe(s.cooldown);
    });
  });

  it('a special that is cooling down cannot be used again until it is ready', () => {
    const w = setup();
    const p = player(w);
    press(w, Btn.S3);
    p.halo = 0;
    run(w, 5);
    press(w, Btn.S3);
    expect(p.halo).toBe(0);
    p.sp[SP.Halo] = 3;
    run(w, 1);
    press(w, Btn.S3);
    expect(p.halo).toBe(0);
    run(w, 1);
    expect(p.sp[SP.Halo]).toBe(0);
    press(w, Btn.S3);
    expect(p.halo).toBe(HALO.dur);
    expect(p.sp[SP.Halo]).toBe(SPECIALS[SP.Halo].cooldown);
  });

  it('cooldowns run down on their own', () => {
    const w = setup();
    const p = player(w);
    p.sp = [1, 2, 3, 4, 5, 6];
    run(w, 7);
    expect(p.sp.every((c) => c === 0)).toBe(true);
  });

  it('buffs can be stacked on a running special, but not on a second beam', () => {
    const w = setup();
    const p = player(w);
    press(w, Btn.S1);
    expect(p.st).toBe(St.Beam);
    press(w, Btn.S4);
    press(w, Btn.S3);
    expect(p.aura).toBeGreaterThan(0);
    expect(p.halo).toBeGreaterThan(0);
    expect(p.st).toBe(St.Beam);
    press(w, Btn.S5);
    expect(p.shield).toBe(0);
    expect(p.sp[SP.Shield]).toBe(0);
  });

  it('cannot be used while knocked down, in the air (beam), or dead', () => {
    const w = setup();
    const p = player(w);
    p.st = St.Down;
    press(w, Btn.S4);
    expect(p.aura).toBe(0);
    p.st = St.Idle;
    p.z = 10;
    p.vz = 0;
    press(w, Btn.S1);
    expect(p.st).not.toBe(St.Beam);
    expect(p.sp[SP.Beam]).toBe(0);
    p.z = 0;
    p.hp = 0;
    press(w, Btn.S4);
    expect(p.aura).toBe(0);
  });
});

describe('光環 / 爆氣 / 聖盾', () => {
  const trigger = (w: World, bit: number) => {
    press(w, bit);
  };

  it('光環 puts a circle on the ground that heals 10% of max health a second', () => {
    const w = setup();
    const p = player(w);
    p.hp = 7;
    trigger(w, Btn.S3);
    expect(p.hp).toBeLessThan(p.maxHp * 0.3);
    expect(p.halo).toBeGreaterThan(0);
    expect(p.mp).toBe(0);
    expect(p.sp[SP.Halo]).toBeGreaterThan(0);
    const hl = snapshot(w).f.find((f) => f.i === p.id)!.hl;
    expect(hl.length).toBe(3);
    const before = p.hp;
    run(w, 60);
    expect(p.hp - before).toBeCloseTo(p.maxHp * 0.1, 1);
    run(w, 600);
    expect(p.hp).toBe(p.maxHp);
    expect(p.halo).toBe(0);
    expect(snapshot(w).f.find((f) => f.i === p.id)!.hl).toEqual([]);
  });

  it('光環 only heals whoever stays inside the circle, and only their own side', () => {
    const w = setup();
    const p = player(w);
    p.hp = 10;
    trigger(w, Btn.S3);
    const friend = foe(w, 0);
    friend.slot = 1;
    friend.kind = 'player';
    const grunt = foe(w, 0);
    grunt.hp = 5;
    grunt.maxHp = 100;
    grunt.aiT = 99999;
    grunt.sp[SP.Halo] = 99999;
    grunt.halo = 0; // the helper copies the hero, circle and all
    p.x += HALO.rx + 20; // walks out of the circle
    p.vx = 0;
    const out = p.hp;
    run(w, 120);
    expect(p.hp).toBe(out);
    expect(grunt.hp).toBe(5);
  });

  it('爆氣 doubles damage for twenty seconds, then wears off', () => {
    const hitFor = (aura: boolean) => {
      const w = setup();
      const p = player(w);
      p.face = 1;
      const e = foe(w, 14, 0, 'saburo', 'grunt', 9999);
      if (aura) {
        trigger(w, Btn.S4);
        expect(p.aura).toBe(AURA.dur - 0);
      }
      press(w, Btn.A);
      run(w, 20);
      return 9999 - e.hp;
    };
    expect(hitFor(true)).toBe(hitFor(false) * AURA.mult);
    const w = setup();
    trigger(w, Btn.S4);
    run(w, AURA.dur + 2);
    expect(player(w).aura).toBe(0);
    expect(player(w).mp).toBe(0);
  });

  it('聖盾 cuts damage to a third, stops flinching, and roots the hero', () => {
    const takeHit = (shield: boolean) => {
      const w = setup();
      const p = player(w);
      p.face = 1;
      p.inv = 0;
      if (shield) trigger(w, Btn.S5);
      const e = foe(w, -14, 0, 'saburo', 'grunt', 100);
      e.face = 1;
      e.aiT = 0;
      e.cd = 0;
      run(w, 40);
      return { lost: p.maxHp - p.hp, st: p.st };
    };
    const plain = takeHit(false);
    const shielded = takeHit(true);
    expect(plain.lost).toBeGreaterThan(0);
    expect(shielded.lost).toBeGreaterThan(0);
    expect(shielded.lost).toBeLessThanOrEqual(Math.ceil(plain.lost / (1 + SHIELD.def)) + 1);
    expect([St.Hurt, St.Down]).not.toContain(shielded.st);

    const w = setup();
    const p = player(w);
    trigger(w, Btn.S5);
    const x0 = p.x;
    const y0 = p.y;
    run(w, 30, { held: Btn.Right | Btn.Down, pressed: 0 });
    expect(p.x).toBe(x0);
    expect(p.y).toBe(y0);
    run(w, SHIELD.dur);
    expect(p.shield).toBe(0);
    const x1 = p.x;
    run(w, 30, { held: Btn.Right, pressed: 0 });
    expect(p.x).toBeGreaterThan(x1);
  });

  it('shows the buffs and cooldowns in the snapshot', () => {
    const w = setup();
    trigger(w, Btn.S4);
    const f = snapshot(w).f.find((q) => q.d === 'ichiro')!;
    expect(f.b & 1).toBe(1);
    expect(f.k[SP.Aura]).toBeGreaterThan(0);
    expect(snapshot(w).f.every((q) => q.d === 'ichiro' || q.k.length === 0)).toBe(true);
  });
});

describe('ninja throwing stars', () => {
  it('a ninja at range throws a star that hurts the hero', () => {
    let hurt = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = setup(seed);
      const p = player(w);
      p.inv = 0;
      p.face = 1;
      const n = foe(w, 100, 0, 'ninja', 'grunt', 100);
      n.aiT = 0;
      n.cd = 0;
      let sawStar = false;
      for (let i = 0; i < 400 && !sawStar; i++) {
        run(w, 1);
        sawStar = w.shots.some((s) => s.kind === 2);
        if (!sawStar && Math.abs(n.x - p.x) < 40) break;
      }
      if (!sawStar) continue;
      const hp0 = p.hp;
      run(w, 90);
      if (p.hp < hp0) hurt++;
    }
    expect(hurt).toBeGreaterThan(5);
  });

  it('a star ignores other enemies', () => {
    const w = setup();
    const p = player(w);
    p.inv = 0;
    const other = foe(w, 80, 0, 'saburo', 'grunt', 50);
    w.shots.push({ id: w.nextId++, kind: 2, x: p.x - 40, y: p.y, z: 20, vx: 3.2, owner: 0, life: 90 });
    w.shots.push({ id: w.nextId++, kind: 2, x: other.x - 20, y: other.y, z: 20, vx: 3.2, owner: 0, life: 90 });
    run(w, 5);
    expect(other.hp).toBe(50);
  });
});

// Puts the world at the end of a lap: only the last wave is left to clear.
function atLapEnd() {
  const w = setup();
  const p = player(w);
  w.wave = STAGE.waves.length;
  w.locked = false;
  w.cam = 1024;
  w.camMax = 1024;
  p.x = 1100;
  return { w, p };
}

// The end of the Tokaido leads into 溫泉關; this skips through it: the opening scene is over and all fifty are down.
function throughOnsen(w: World) {
  run(w, 200);
  expect(w.stage).toBe(STAGE_ONSEN);
  w.phase = 1;
  w.phaseT = 0;
  w.kills = ONSEN.total;
  w.spawned = ONSEN.total - 1;
  w.traitor = 1;
  w.fighters = w.fighters.filter((f) => f.kind === 'player');
  run(w, ONSEN.clearDelay + 20);
}

describe('endless loop', () => {
  it('after the general comes 溫泉關, then the next lap, keeping lives, score, weapon and cooldowns', () => {
    const { w, p } = atLapEnd();
    w.slots[0].lives = 2;
    w.slots[0].score = 4200;
    p.weapon = WID.Saber;
    p.wn = 12;
    p.hp = 33;
    p.sp[SP.Aura] = 5000;
    w.items.push({ id: w.nextId++, kind: WID.Bamboo, x: 1150, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 5 });
    run(w, 200);
    expect(w.stage).toBe(STAGE_ONSEN);
    expect(w.lap).toBe(0);
    expect(p.weapon).toBe(WID.Saber);
    throughOnsen(w);
    expect(w.stage).toBe(STAGE_TOKAIDO);
    expect(w.lap).toBe(1);
    expect(w.status).toBe(0);
    expect(w.cam).toBeLessThan(5);
    expect(w.wave).toBeLessThanOrEqual(1);
    expect(p.x).toBeLessThan(300);
    expect(w.slots[0].lives).toBe(2);
    expect(w.slots[0].score).toBe(4200);
    expect(p.weapon).toBe(WID.Saber);
    expect(p.wn).toBe(12);
    expect(p.hp).toBe(33);
    expect(p.sp[SP.Aura]).toBeGreaterThan(0);
    // the weapon lying on the floor is gone; the one in the hand stays
    expect(w.items.some((i) => i.kind === WID.Bamboo)).toBe(false);
  });

  it('the first wave comes again, and a second lap can follow', () => {
    const { w } = atLapEnd();
    throughOnsen(w);
    run(w, 100);
    expect(w.lap).toBe(1);
    expect(w.fighters.some((f) => f.kind !== 'player')).toBe(true);
    // beat the lap again
    w.wave = STAGE.waves.length;
    w.locked = false;
    w.fighters = w.fighters.filter((f) => f.kind === 'player');
    w.cam = 1024;
    throughOnsen(w);
    expect(w.lap).toBe(2);
  });

  it('does not loop while a wave is still being fought', () => {
    const { w } = atLapEnd();
    w.wave = STAGE.waves.length - 1;
    w.locked = true;
    foe(w, 60, 0, 'saburo', 'grunt', 9999);
    run(w, 500);
    expect(w.lap).toBe(0);
  });

  it('reports the lap in the snapshot', () => {
    const { w } = atLapEnd();
    throughOnsen(w);
    expect(snapshot(w).lp).toBe(1);
    expect(snapshot(w).sg).toBe(STAGE_TOKAIDO);
  });
});

describe('1UP', () => {
  it('is picked up by walking over it and adds a life, not held as a weapon', () => {
    const w = setup();
    const p = player(w);
    w.slots[0].lives = 3;
    w.items.push({ id: w.nextId++, kind: ITEM_1UP, x: p.x + 60, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 0 });
    press(w, Btn.A);
    run(w, 20);
    expect(p.weapon).toBe(0);
    expect(w.slots[0].lives).toBe(3);
    run(w, 80, { held: Btn.Right, pressed: 0 });
    expect(w.slots[0].lives).toBe(4);
    expect(w.items.length).toBe(0);
  });

  it('stays on the ground until somebody takes it, even into the next lap', () => {
    const { w, p } = atLapEnd();
    w.items.push({ id: w.nextId++, kind: ITEM_1UP, x: 1010, y: p.y - 40, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 0 });
    throughOnsen(w);
    expect(w.lap).toBe(1);
    expect(w.items.some((i) => i.kind === ITEM_1UP)).toBe(true);
  });
});

describe('越打越難', () => {
  // The world just before the first wave of a given lap spawns.
  const lapWorld = (lap: number, seed = 11) => {
    const w = setup(seed);
    w.lap = lap;
    w.stageT = 100;
    return w;
  };
  const foes = (w: World) => w.fighters.filter((f) => f.kind !== 'player');

  it('lap 1 is the plain stage', () => {
    const w = lapWorld(0);
    run(w, 5);
    const fs = foes(w);
    expect(fs.length).toBe(STAGE.waves[0].enemies.length);
    expect(fs.every((f) => f.maxHp === DEFS[f.def].hp)).toBe(true);
  });

  it('each lap adds one enemy to a wave and 10% health', () => {
    for (const lap of [1, 2, 5]) {
      const w = lapWorld(lap);
      run(w, 5);
      const fs = foes(w);
      expect(fs.length).toBe(STAGE.waves[0].enemies.length + lap);
      for (const f of fs) expect(f.maxHp).toBe(Math.round(DEFS[f.def].hp * (1 + 0.1 * lap)));
      expect(fs.every((f) => f.hp === f.maxHp)).toBe(true);
    }
  });

  it('the last wave gets more grunts but still only one general', () => {
    const w = lapWorld(3);
    w.wave = STAGE.waves.length - 1;
    w.cam = 1024;
    w.camMax = 1024;
    player(w).x = 1100;
    run(w, 5);
    const last = STAGE.waves[STAGE.waves.length - 1];
    expect(foes(w).length).toBe(last.enemies.length + 3);
    expect(foes(w).filter((f) => f.kind === 'boss').length).toBe(1);
    expect(foes(w).find((f) => f.kind === 'boss')!.maxHp).toBe(Math.round(DEFS.shogun.hp * 1.3));
  });

  it('enemies hit harder every lap', () => {
    const lost = (lap: number) => {
      const w = setup();
      w.lap = lap;
      const p = player(w);
      p.inv = 0;
      p.face = 1;
      p.maxHp = p.hp = 1000;
      const e = foe(w, -14, 0, 'bushi', 'grunt', 9999);
      e.face = 1;
      e.aiT = 0;
      e.cd = 0;
      run(w, 60);
      return p.maxHp - p.hp;
    };
    const base = lost(0);
    expect(base).toBeGreaterThan(0);
    expect(lost(10)).toBeGreaterThan(base * 1.5);
  });

  it('ninja stars hurt more every lap', () => {
    const dmg = (lap: number) => {
      const w = setup();
      w.lap = lap;
      const p = player(w);
      p.inv = 0;
      p.maxHp = p.hp = 500;
      w.shots.push({ id: w.nextId++, kind: 2, x: p.x - 3, y: p.y, z: 20, vx: 3.2, owner: 0, life: 90 });
      run(w, 5);
      return p.maxHp - p.hp;
    };
    expect(dmg(10)).toBe(Math.round(6 * 2));
    expect(dmg(0)).toBe(6);
  });
});

describe('tonic', () => {
  it('about one defeated enemy in ten leaves one', () => {
    let tonics = 0;
    const n = 600;
    for (let seed = 1; seed <= n; seed++) {
      const w = createWorld(seed);
      addPlayer(w, 0);
      for (let i = 0; i < 5; i++) step(w, [none, undefined]);
      w.stageT = -100000;
      const g = foe(w, 100, 0, 'saburo', 'grunt', 10);
      g.hp = 0;
      g.st = St.Down;
      g.t = 44;
      for (let i = 0; i < 4; i++) step(w, [none, undefined]);
      tonics += w.items.filter((it) => it.kind === ITEM_TONIC).length;
    }
    expect(tonics).toBeGreaterThan(n * 0.06);
    expect(tonics).toBeLessThan(n * 0.14);
  });

  it('walking over it raises the health and mana caps by 10 and heals 10', () => {
    const w = setup();
    const p = player(w);
    p.hp = 50;
    const max = p.maxHp;
    w.items.push({ id: w.nextId++, kind: ITEM_TONIC, x: p.x + 40, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 0 });
    press(w, Btn.A);
    run(w, 20);
    expect(p.weapon).toBe(0);
    run(w, 60, { held: Btn.Right, pressed: 0 });
    expect(p.maxHp).toBe(max + 10);
    expect(p.mpMax).toBe(110);
    expect(p.hp).toBe(60);
    expect(w.items.length).toBe(0);
    const f = snapshot(w).f.find((q) => q.i === p.id)!;
    expect(f.m).toBe(max + 10);
    expect(f.em).toBe(110);
  });

  it('the bonus stays through death and the next lap', () => {
    const { w, p } = atLapEnd();
    p.maxHp += 20;
    p.mpMax += 20;
    p.hp = 5;
    throughOnsen(w);
    expect(w.lap).toBe(1);
    expect(p.maxHp).toBe(120);
    expect(p.mpMax).toBe(120);
  });
});

describe('enemy 光環', () => {
  it('a hurt enemy heals itself with holy light, then has to wait', () => {
    const w = setup(7);
    const e = foe(w, 200, 0, 'bushi', 'grunt', 100);
    e.aiT = 0;
    e.hp = 30;
    let healed = -1;
    for (let i = 0; i < 600 && healed < 0; i++) {
      run(w, 1);
      if (e.halo > 0) healed = i;
    }
    expect(healed).toBeGreaterThanOrEqual(0);
    expect(snapshot(w).f.find((f) => f.i === e.id)!.b & 4).toBe(4);
    run(w, ENEMY_HALO.dur);
    expect(e.hp).toBe(30 + 100 * 0.4);
    // hurt again right away: no second heal until the cooldown is over
    e.hp = 10;
    run(w, ENEMY_HALO.cooldown - ENEMY_HALO.dur - 60);
    expect(e.hp).toBe(10);
    run(w, 600);
    expect(e.hp).toBeGreaterThan(10);
  });

  it('a healthy enemy never does it', () => {
    const w = setup(7);
    const e = foe(w, 200, 0, 'bushi', 'grunt', 100);
    e.aiT = 0;
    e.hp = 70;
    run(w, 1200);
    expect(e.halo).toBe(0);
    expect(e.hp).toBe(70);
  });

  it('does not heal an enemy that is knocked down or being hurt', () => {
    const w = setup(7);
    const e = foe(w, 200, 0, 'bushi', 'grunt', 100);
    e.hp = 20;
    e.st = St.Hurt;
    e.t = 0;
    e.stun = 400;
    run(w, 100);
    expect(e.halo).toBe(0);
    expect(e.hp).toBe(20);
  });
});

// ---------- gatling ----------

describe('手持式加特靈機關槍', () => {
  const spray = (w: World, n: number) => run(w, n, { held: Btn.A, pressed: 0 });

  it('has 1000 rounds and fires every few ticks while A is held', () => {
    expect(WEAPONS[WID.Gatling].uses).toBe(1000);
    const w = setup();
    const p = give(w, WID.Gatling);
    press(w, Btn.A);
    spray(w, 60);
    const used = 1000 - p.wn;
    expect(used).toBeGreaterThanOrEqual(15);
    expect(used).toBeLessThanOrEqual(25);
    expect(p.heat).toBe(used);
    run(w, 10);
    expect(p.st).toBe(St.Idle);
    expect(p.weapon).toBe(WID.Gatling);
  });

  it('its bullets pin an enemy in place and wear it down', () => {
    const w = setup();
    give(w, WID.Gatling);
    const e = foe(w, 100, 0, 'saburo', 'grunt', 9999);
    press(w, Btn.A);
    spray(w, 120);
    expect(e.hp).toBeLessThan(9999 - 6 * 4);
    expect(e.st).toBe(St.Hurt);
  });

  it('the barrel glows from 300 shots on and jams at 500 for ten seconds', () => {
    const w = setup();
    const p = give(w, WID.Gatling);
    press(w, Btn.A);
    let reportedRed = false;
    let guard = 0;
    while (p.heatCd === 0 && guard++ < 3000) {
      spray(w, 1);
      const ht = snapshot(w).f.find((f) => f.i === p.id)!.ht;
      if (p.heat >= GATLING.red) reportedRed = reportedRed || ht >= GATLING.red;
      if (p.heat < GATLING.red) expect(ht).toBeLessThan(GATLING.red);
    }
    expect(reportedRed).toBe(true);
    expect(p.heat).toBe(GATLING.overheat);
    expect(p.heatCd).toBe(GATLING.rest);
    expect(1000 - p.wn).toBe(GATLING.overheat);
    expect(snapshot(w).f.find((f) => f.i === p.id)!.ht).toBe(510);
    // still jammed: holding A does nothing
    spray(w, 300);
    expect(1000 - p.wn).toBe(GATLING.overheat);
    expect(p.st).not.toBe(St.Shoot);
    // ten seconds later it is cool and fires again
    run(w, GATLING.rest);
    expect(p.heat).toBe(0);
    press(w, Btn.A);
    spray(w, 20);
    expect(1000 - p.wn).toBeGreaterThan(GATLING.overheat);
  });

  it('cools down while the trigger is released', () => {
    const w = setup();
    const p = give(w, WID.Gatling);
    p.heat = 200;
    run(w, 400);
    expect(p.heat).toBe(100);
    run(w, 1000);
    expect(p.heat).toBe(0);
  });

  it('the empty gun disappears', () => {
    const w = setup();
    const p = give(w, WID.Gatling, 3);
    press(w, Btn.A);
    spray(w, 30);
    expect(p.weapon).toBe(0);
    expect(p.wn).toBe(0);
  });
});

// ---------- 百裂拳 / 龍捲風腳 ----------

describe('run + A / B with empty hands', () => {
  const runAnd = (w: World, btn: number) => {
    const p = player(w);
    p.face = 1;
    run(w, 3, { held: Btn.Right, pressed: 0 });
    p.st = St.Run;
    p.vx = 2;
    press(w, btn, Btn.Right);
    run(w, 6, { held: Btn.Right, pressed: 0 });
    return p;
  };

  it('A starts 百裂拳: twenty punches that cannot be interrupted', () => {
    const w = setup();
    const p = runAnd(w, Btn.A);
    expect(p.st).toBe(St.Barrage);
    const e = foe(w, 14, 0, 'saburo', 'grunt', 9999);
    e.face = -1;
    let flying = false;
    for (let i = 0; i < 100; i++) {
      run(w, 1);
      if (e.st === St.Down) flying = true;
      if (!flying) expect(e.st === St.Hurt || e.st === St.Idle).toBe(true);
    }
    // 20 punches of 3
    expect(9999 - e.hp).toBe(BARRAGE.punches * 3);
    expect(flying).toBe(true);
    expect(p.st).toBe(St.Idle);
  });

  it('enemies cannot knock the hero out of it', () => {
    const w = setup();
    const p = runAnd(w, Btn.A);
    p.inv = 0;
    const e = foe(w, -14, 0, 'bushi', 'grunt', 9999);
    e.face = 1;
    e.aiT = 0;
    e.cd = 0;
    let hurt = false;
    for (let i = 0; i < 60; i++) {
      run(w, 1);
      if (p.st === St.Hurt || p.st === St.Down) hurt = true;
    }
    expect(hurt).toBe(false);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('B starts 龍捲風腳: hovers, hits both sides several times, then lands', () => {
    const w = setup();
    const p = runAnd(w, Btn.B);
    expect(p.st).toBe(St.Tatsu);
    const front = foe(w, 18, 0, 'saburo', 'grunt', 9999);
    const back = foe(w, -18, 0, 'saburo', 'grunt', 9999);
    front.face = back.face = 1;
    front.z = back.z = 0; // foe() copies the hero, who is in the air
    front.vz = back.vz = 0;
    front.st = back.st = St.Idle;
    front.t = back.t = 0;
    let maxZ = 0;
    const x0 = p.x;
    for (let i = 0; i < TATSU.total + 10; i++) {
      run(w, 1);
      maxZ = Math.max(maxZ, p.z);
    }
    expect(maxZ).toBeGreaterThan(8);
    expect(p.z).toBe(0);
    expect(p.st).toBe(St.Idle);
    expect(p.x).toBeGreaterThan(x0);
    expect(front.hp).toBeLessThan(9999 - 3 * 5);
    // the one behind is only in reach until the hero has drifted away
    expect(back.hp).toBeLessThan(9999);
  });

  it('is not triggered with a weapon in hand', () => {
    for (const btn of [Btn.A, Btn.B]) {
      const w = setup();
      give(w, WID.Saber);
      const p = runAnd(w, btn);
      expect([St.Barrage, St.Tatsu]).not.toContain(p.st);
    }
  });

  it('is not triggered from standing still: that is the normal punch and kick', () => {
    const w = setup();
    const p = player(w);
    press(w, Btn.A);
    run(w, 4);
    expect(p.st).toBe(St.Punch);
  });
});

// ---------- 天雷萬鈞 ----------

describe('天雷萬鈞 (special 6)', () => {
  it('rains lightning for ten seconds over the whole battlefield', () => {
    const w = setup(3);
    const p = player(w);
    const foes = [foe(w, 60, 0, 'saburo', 'grunt', 600), foe(w, 150, 25, 'bushi', 'grunt', 600), foe(w, 100, -20, 'ninja', 'grunt', 600)];
    for (const f of foes) f.sp[SP.Halo] = 99999;
    press(w, Btn.S6);
    expect(p.storm).toBeGreaterThan(0);
    expect(p.sp[SP.Thunder]).toBe(SPECIALS[SP.Thunder].cooldown);
    expect(snapshot(w).f.find((f) => f.i === p.id)!.b & 16).toBe(16);
    let strikes = 0;
    for (let i = 0; i < THUNDER.dur + 10; i++) {
      run(w, 1);
      for (const ev of w.ev) if (ev[3] === 4) strikes++;
      w.ev.length = 0;
    }
    expect(strikes).toBe(THUNDER.dur / THUNDER.gap);
    expect(p.storm).toBe(0);
    for (const f of foes) expect(f.hp).toBeLessThan(600);
    expect(p.hp).toBe(p.maxHp);
  });

  it('keeps the hero free to move and fight while it rains', () => {
    const w = setup();
    const p = player(w);
    press(w, Btn.S6);
    const x0 = p.x;
    run(w, 30, { held: Btn.Right, pressed: 0 });
    expect(p.x).toBeGreaterThan(x0);
  });

  it('can be cast together with the other specials, and does not wipe their cooldowns', () => {
    const w = setup();
    const p = player(w);
    p.sp[SP.Aura] = 300;
    press(w, Btn.S6);
    expect(p.sp[SP.Aura]).toBeGreaterThan(250);
    expect(p.aura).toBe(0);
  });

  it('only hits enemies, and ends when the hero falls', () => {
    const w = setup();
    const p = player(w);
    press(w, Btn.S6);
    p.hp = 0;
    p.st = St.Down;
    p.t = 44;
    run(w, 5);
    expect(p.storm).toBe(0);
  });
});

describe('run buttons', () => {
  it('start a run in either direction while held, and stop when released', () => {
    for (const [btn, dir] of [[Btn.RunR, 1], [Btn.RunL, -1]] as const) {
      const w = setup();
      const p = player(w);
      w.cam = 500;
      p.x = 640;
      const x0 = p.x;
      for (let i = 0; i < 30; i++) step(w, [{ held: btn, pressed: i === 0 ? btn : 0 }, undefined]);
      expect(p.st).toBe(St.Run);
      expect(p.face).toBe(dir);
      expect((p.x - x0) * dir).toBeGreaterThan(30);
      for (let i = 0; i < 20; i++) step(w, [none, undefined]);
      expect(p.st).toBe(St.Idle);
    }
  });
});

describe('雙劍 / 炫風斬', () => {
  const slash = (w: World) => {
    press(w, Btn.A);
    run(w, 20);
  };

  it('a chain of slashes turns into the spinning 炫風斬, which does not wait for anything else', () => {
    const w = setup();
    const p = player(w);
    give(w, WID.Twin);
    for (let i = 0; i < TWIN.chain - 1; i++) {
      slash(w);
      expect(p.st).not.toBe(St.Whirl);
    }
    press(w, Btn.A);
    run(w, 6);
    expect(p.st).toBe(St.Whirl);
  });

  it('slashes that come too late do not count towards the chain', () => {
    const w = setup();
    const p = player(w);
    give(w, WID.Twin);
    for (let i = 0; i < TWIN.chain + 2; i++) {
      press(w, Btn.A);
      run(w, WEAPONS[WID.Twin].atk.total + TWIN.window + 10);
      expect(p.st).not.toBe(St.Whirl);
    }
  });

  it('spins for ten seconds, can walk about, hits both sides, and cannot be knocked out of it', () => {
    const w = setup();
    const p = player(w);
    w.cam = 400;
    p.x = 500;
    give(w, WID.Twin);
    p.slash = TWIN.chain - 1;
    p.slashT = 30;
    press(w, Btn.A);
    run(w, 8);
    expect(p.st).toBe(St.Whirl);
    const ahead = foe(w, 18);
    const behind = foe(w, -18);
    ahead.aiT = behind.aiT = 99999;
    ahead.hp = ahead.maxHp = behind.hp = behind.maxHp = 500;
    const x0 = p.x;
    run(w, 60, { held: Btn.Right, pressed: 0 });
    expect(p.x - x0).toBeGreaterThan(30);
    expect(p.st).toBe(St.Whirl);
    expect(ahead.hp).toBeLessThan(500);
    // getting hit does not stop it, and the hero is not pushed back
    const hpBefore = p.hp;
    hit(w, p, 0, 3, 2, true, 2.4, 1);
    expect(p.hp).toBe(hpBefore - 3);
    expect(p.st).toBe(St.Whirl);
    // it is over after TWIN.dur ticks, and costs some of the blades' uses
    const wn = p.wn;
    run(w, TWIN.dur + 20);
    expect(p.st).not.toBe(St.Whirl);
    expect(p.wn).toBe(wn - TWIN.cost);
  });

  it('is drawn as a state the client knows, and the twin swords can drop', () => {
    expect(WEAPONS[WID.Twin].dropWeight).toBeGreaterThan(0);
    const w = setup();
    const p = player(w);
    give(w, WID.Twin);
    p.st = St.Whirl;
    expect(snapshot(w).f.find((f) => f.i === p.id)!.s).toBe(St.Whirl);
  });
});

describe('雙持 (two blades, one in each hand)', () => {
  const drop = (w: World, kind: number, n: number, dx = 4) => {
    const p = player(w);
    w.items.push({ id: w.nextId++, kind, x: p.x + dx, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n });
  };

  it('picking up a second blade while holding one puts it in the other hand', () => {
    const w = setup();
    const p = give(w, WID.Bamboo, 10);
    drop(w, WID.Saber, 25);
    press(w, Btn.A);
    run(w, 30);
    expect([p.weapon, p.wn, p.weapon2, p.wn2]).toEqual([WID.Bamboo, 10, WID.Saber, 25]);
    expect(w.items.length).toBe(0);
    const s = snapshot(w).f.find((f) => f.i === p.id)!;
    expect([s.w, s.w2, s.n, s.n2]).toEqual([WID.Bamboo, WID.Saber, 10, 25]);
  });

  it('only blades pair up: a stick, or a third blade, is left on the ground', () => {
    const w = setup();
    const p = give(w, WID.Bamboo, 10);
    drop(w, WID.Stick, 14);
    press(w, Btn.A);
    run(w, 30);
    expect(p.weapon2).toBe(0);
    expect(w.items.length).toBe(1);
    const q = setup();
    const r = give(q, WID.Stick, 14);
    drop(q, WID.Bamboo, 5);
    press(q, Btn.A);
    run(q, 30);
    expect(r.weapon2).toBe(0);
    const t = setup();
    const u = give(t, WID.Saber, 10);
    u.weapon2 = WID.Bamboo;
    u.wn2 = 5;
    drop(t, WID.Saber, 9);
    press(t, Btn.A);
    run(t, 30);
    expect(t.items.length).toBe(1);
  });

  it('the hands take turns, each blade wearing out on its own', () => {
    const w = setup();
    const p = give(w, WID.Saber, 30);
    p.weapon2 = WID.Bamboo;
    p.wn2 = 18;
    const hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const e = foe(w, 22, 0, 'saburo', 'grunt', 9999);
      e.aiT = 99999;
      press(w, Btn.A);
      run(w, 24);
      hits.push(p.wn, p.wn2);
      w.fighters = w.fighters.filter((f) => f === p);
    }
    // main hand, other hand, main hand
    expect(hits).toEqual([29, 18, 29, 17, 28, 17]);
  });

  it('four slashes in a row are 炫風斬 with two blades too, and the two share the wear', () => {
    const w = setup();
    const p = give(w, WID.Saber, 30);
    p.weapon2 = WID.Bamboo;
    p.wn2 = 18;
    for (let i = 0; i < TWIN.chain - 1; i++) {
      press(w, Btn.A);
      run(w, 20);
    }
    press(w, Btn.A);
    run(w, 6);
    expect(p.st).toBe(St.Whirl);
    run(w, TWIN.dur + 20);
    expect(p.st).not.toBe(St.Whirl);
    expect(p.wn).toBe(30 - TWIN.cost / 2);
    expect(p.wn2).toBe(18 - TWIN.cost / 2);
  });

  it('B throws the other hand blade first, then the main one', () => {
    const w = setup();
    const p = give(w, WID.Saber, 30);
    p.weapon2 = WID.Bamboo;
    p.wn2 = 18;
    press(w, Btn.B);
    run(w, 40);
    expect([p.weapon, p.weapon2]).toEqual([WID.Saber, 0]);
    expect(w.items.map((i) => [i.kind, i.n])).toEqual([[WID.Bamboo, 18]]);
    press(w, Btn.B);
    run(w, 40);
    expect(p.weapon).toBe(0);
    expect(w.items.length).toBe(2);
  });

  it('when the main blade breaks, the other one takes its place', () => {
    const w = setup();
    const p = give(w, WID.Saber, 1);
    p.weapon2 = WID.Bamboo;
    p.wn2 = 18;
    const e = foe(w, 22, 0, 'saburo', 'grunt', 9999);
    e.aiT = 99999;
    press(w, Btn.A);
    run(w, 24);
    expect([p.weapon, p.wn, p.weapon2]).toEqual([WID.Bamboo, 18, 0]);
  });

  it('both blades fall when the hero is knocked down', () => {
    const w = setup();
    const p = give(w, WID.Saber, 30);
    p.weapon2 = WID.Bamboo;
    p.wn2 = 18;
    hit(w, p, -1, 3, 1, true, 2, 1);
    expect([p.weapon, p.weapon2]).toEqual([0, 0]);
    expect(w.items.map((i) => i.kind).sort()).toEqual([WID.Bamboo, WID.Saber].sort());
  });
});

describe('溫泉關', () => {
  // Starts right at the opening scene, as the end of the Tokaido does.
  const onsen = (seed = 11) => {
    const w = setup(seed);
    enterOnsen(w);
    return w;
  };
  const toFight = (w: World) => {
    run(w, ONSEN.intro.end + 2);
    expect(w.phase).toBe(1);
  };

  it('starts on one locked screen with the heroes on the left, and the walking ground is shallow', () => {
    const w = onsen();
    const p = player(w);
    expect(w.stage).toBe(STAGE_ONSEN);
    expect(w.cam).toBe(0);
    expect(w.camMax).toBe(0);
    expect(p.x).toBeLessThan(100);
    run(w, 10, { held: Btn.Down, pressed: 0 });
    run(w, 200, { held: Btn.Down, pressed: 0 });
    expect(p.y).toBeLessThanOrEqual(ONSEN.groundMax);
    run(w, 400, { held: Btn.Up, pressed: 0 });
    expect(p.y).toBeGreaterThanOrEqual(ONSEN.groundMin);
  });

  it('the opening scene cannot be steered; the envoy is kicked into the pool and the fight begins', () => {
    const w = onsen();
    const p = player(w);
    const x0 = p.x;
    let sawEnvoy = false;
    let splash = false;
    let xEnd = x0;
    for (let i = 0; i < ONSEN.intro.end + 2; i++) {
      step(w, [{ held: Btn.Right | Btn.A, pressed: i % 10 === 0 ? Btn.A : 0 }, undefined]);
      if (i === ONSEN.intro.end - 4) xEnd = p.x;
      if (w.fighters.some((f) => f.script)) sawEnvoy = true;
      if (snapshot(w).ev.some((e) => e[3] === 5)) splash = true;
    }
    expect(Math.abs(xEnd - x0)).toBeLessThan(2);
    expect(sawEnvoy).toBe(true);
    expect(splash).toBe(true);
    expect(w.fighters.some((f) => f.script)).toBe(false);
    expect(w.phase).toBe(1);
    expect(w.banner?.[0]).toBe(ONSEN.banner.title);
    expect(w.kills).toBe(0);
  });

  it('elites come from the right a few at a time, stronger than the plain ones', () => {
    const w = onsen();
    toFight(w);
    let most = 0;
    for (let i = 0; i < 600; i++) {
      step(w, [none, undefined]);
      most = Math.max(most, w.fighters.filter((f) => f.kind !== 'player').length);
    }
    expect(most).toBe(ONSEN.cap);
    const e = w.fighters.find((f) => f.kind !== 'player')!;
    expect(e.elite).toBe(1);
    expect(e.maxHp).toBeGreaterThanOrEqual(Math.round(DEFS[e.def].hp * ONSEN.hp));
    expect(snapshot(w).f.find((f) => f.i === e.id)!.b & 32).toBe(32);
  });

  it('one more elite at a time each lap', () => {
    const w = onsen();
    w.lap = 2;
    toFight(w);
    let most = 0;
    for (let i = 0; i < 900; i++) {
      step(w, [none, undefined]);
      most = Math.max(most, w.fighters.filter((f) => f.kind !== 'player').length);
    }
    expect(most).toBe(ONSEN.cap + 2);
  });

  it('the traitor walks in from the left at the 35th kill, and the pass is held at the 50th', () => {
    const w = onsen();
    toFight(w);
    const p = player(w);
    p.hp = p.maxHp = 999999;
    w.kills = ONSEN.traitorAt - 1;
    w.spawned = ONSEN.traitorAt - 1;
    run(w, 5);
    expect(w.fighters.some((f) => f.elite === 2)).toBe(false);
    w.kills = ONSEN.traitorAt;
    run(w, 2);
    const t = w.fighters.find((f) => f.elite === 2)!;
    expect(t).toBeTruthy();
    expect(t.x).toBeLessThan(40);
    expect(w.banner?.[0]).toBe(ONSEN.banner.traitor);
    expect(snapshot(w).f.find((f) => f.i === t.id)!.b & 64).toBe(64);
    // the rest is fought through
    w.fighters = w.fighters.filter((f) => f.kind === 'player');
    w.spawned = ONSEN.total - 1;
    w.kills = ONSEN.total;
    run(w, 3);
    expect(w.phase).toBe(2);
    expect(w.banner?.[0]).toBe(ONSEN.banner.cleared);
    run(w, ONSEN.clearDelay + 5);
    expect(w.stage).toBe(STAGE_TOKAIDO);
    expect(w.lap).toBe(1);
  });

  it('kills are counted, and exactly fifty enemies come in all', () => {
    const w = onsen(5);
    toFight(w);
    const p = player(w);
    p.hp = p.maxHp = 9999999;
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 60 * 5 && w.phase === 1; i++) {
      // the hero is a wall: every enemy that is on the screen dies at once
      for (const f of w.fighters) if (f.kind !== 'player') {
        seen.add(f.id);
        if (f.st !== St.Dead && f.st !== St.Down) f.hp = Math.min(f.hp, 0.0001);
      }
      for (const f of w.fighters) if (f.kind !== 'player' && f.st !== St.Dead && f.st !== St.Down) hit(w, f, 0, 9999, 1, true, 2, 1);
      step(w, [none, undefined]);
    }
    expect(w.phase).toBe(2);
    expect(w.kills).toBe(ONSEN.total);
    expect(seen.size).toBe(ONSEN.total);
  });

  it('only what the heroes hold comes along: weapons on the floor are swept away at both ends', () => {
    const w = setup();
    const p = player(w);
    p.weapon = WID.Saber;
    p.wn = 20;
    w.items.push({ id: w.nextId++, kind: WID.Rifle, x: p.x + 30, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 9 });
    w.items.push({ id: w.nextId++, kind: ITEM_1UP, x: p.x + 40, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 0 });
    enterOnsen(w);
    expect(w.items.map((i) => i.kind)).toEqual([ITEM_1UP]);
    expect(p.weapon).toBe(WID.Saber);
    expect(p.wn).toBe(20);
    toFight(w);
    w.items.push({ id: w.nextId++, kind: WID.Stick, x: 100, y: p.y, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, n: 5 });
    w.phase = 2;
    w.phaseT = ONSEN.clearDelay - 2;
    w.fighters = w.fighters.filter((f) => f.kind === 'player');
    run(w, 4);
    expect(w.stage).toBe(STAGE_TOKAIDO);
    expect(w.items.some((i) => i.kind === WID.Stick)).toBe(false);
    expect(p.weapon).toBe(WID.Saber);
  });

  it('reports the stage, phase and kills in the snapshot', () => {
    const w = onsen();
    let s = snapshot(w);
    expect([s.sg, s.ph]).toEqual([STAGE_ONSEN, 0]);
    toFight(w);
    w.kills = 7;
    s = snapshot(w);
    expect([s.sg, s.ph, s.kl]).toEqual([STAGE_ONSEN, 1, 7]);
    expect(s.bn.length).toBe(2);
  });
});

describe('攻擊N, 傷害數字, 爆擊, and shouting the move', () => {
  const evs = (w: World) => snapshot(w).ev;

  it('every blow that lands on an enemy counts, announces its damage, and the counter runs out after a while', () => {
    const w = setup();
    const p = player(w);
    const e = foe(w, 18, 0, 'saburo', 'grunt', 9999);
    e.aiT = 99999;
    const seen: GameEvent[] = [];
    press(w, Btn.A);
    for (let i = 0; i < 30; i++) {
      step(w, [none, undefined]);
      for (const ev of evs(w)) if (ev[3] === EV_DAMAGE) seen.push(ev);
    }
    expect(seen.length).toBe(1);
    expect(seen[0][4]).toBeGreaterThan(0);
    expect(p.chain).toBe(1);
    expect(snapshot(w).f.find((f) => f.i === p.id)!.cb).toBe(1);
    run(w, COMBO.keep + 2);
    expect(p.chain).toBe(0);
  });

  it('百裂拳 counts twenty and the hero shouts its name', () => {
    const w = setup();
    const p = player(w);
    p.face = 1;
    run(w, 3, { held: Btn.Right, pressed: 0 });
    p.st = St.Run;
    p.vx = 2;
    press(w, Btn.A, Btn.Right);
    run(w, 6, { held: Btn.Right, pressed: 0 });
    expect(p.st).toBe(St.Barrage);
    const e = foe(w, 14, 0, 'saburo', 'grunt', 9999);
    e.face = -1;
    expect(snapshot(w).f.find((f) => f.i === p.id)!.cr).toBe(CRY.barrage);
    run(w, 100);
    expect(p.chain).toBe(BARRAGE.punches);
    expect(snapshot(w).f.find((f) => f.i === p.id)!.cr).toBe(0);
  });

  it('every special has its name shouted, 炫風斬 included', () => {
    for (const s of SPECIALS) {
      const w = setup();
      const p = player(w);
      press(w, s.bit);
      expect(snapshot(w).f.find((f) => f.i === p.id)!.cr).toBe(CRY.special + s.id);
      expect(CRY_TEXT[CRY.special + s.id]).toBeTruthy();
    }
    expect(CRY_TEXT[CRY.whirl]).toBe('炫風斬！');
  });

  it('a critical hit does double damage and is announced as one; the hero being hurt resets the counter', () => {
    CRIT.chance = 1;
    try {
      const w = setup();
      const p = player(w);
      const e = foe(w, 18, 0, 'saburo', 'grunt', 9999);
      e.aiT = 99999;
      press(w, Btn.A);
      let crit: GameEvent | undefined;
      for (let i = 0; i < 30; i++) {
        step(w, [none, undefined]);
        crit = crit ?? evs(w).find((ev) => ev[3] === EV_CRIT);
      }
      expect(crit).toBeTruthy();
      expect(e.maxHp - e.hp).toBe(crit![4]);
      expect(crit![4]).toBe(Math.round(6 * CRIT.mult * DEFS[p.def].dmg));
      expect(p.chain).toBe(1);
      hit(w, p, -1, 3, 1, false, 0, 1);
      expect(p.chain).toBe(0);
    } finally {
      CRIT.chance = 0;
    }
  });

  it('is deterministic: the same world gives the same critical hits', () => {
    CRIT.chance = 0.3;
    try {
      const play = () => {
        const w = setup(5);
        const e = foe(w, 18, 0, 'saburo', 'grunt', 99999);
        e.aiT = 99999;
        const out: number[] = [];
        const p = player(w);
        for (let i = 0; i < 600; i++) {
          // a punch bag: stands right in front of the hero, however hard it is hit
          e.x = p.x + 18;
          e.y = p.y;
          e.z = 0;
          e.vx = e.vy = e.vz = 0;
          e.st = St.Idle;
          step(w, [{ held: 0, pressed: i % 14 === 0 ? Btn.A : 0 }, undefined]);
          for (const ev of snapshot(w).ev) if (ev[3] === EV_CRIT || ev[3] === EV_DAMAGE) out.push(ev[3], ev[4] ?? 0);
        }
        return out;
      };
      const a = play();
      expect(a.length).toBeGreaterThan(10);
      expect(a).toEqual(play());
      expect(a.filter((k, i) => i % 2 === 0 && k === EV_CRIT).length).toBeGreaterThan(0);
    } finally {
      CRIT.chance = 0;
    }
  });
});

describe('wide view (/?wide)', () => {
  it('a wider screen means a wider battlefield: enemies come from beyond its edge, the stage is longer, the general still waits at the end', () => {
    const w = createWorld(11, 384);
    addPlayer(w, 0);
    expect(snapshot(w).vw).toBe(384);
    w.stageT = 60;
    run(w, 5);
    // the first wave comes in from just beyond the right edge of the wide screen
    const first = w.fighters.filter((f) => f.kind !== 'player');
    expect(first.length).toBeGreaterThan(0);
    expect(Math.min(...first.map((f) => f.x))).toBeGreaterThanOrEqual(384);
    // the hero is held inside the wide screen
    const p = player(w);
    run(w, 600, { held: Btn.Right, pressed: 0 });
    expect(p.x).toBeLessThanOrEqual(w.cam + 384 - 8);
    expect(p.x).toBeGreaterThan(300);
    // the last screen of the stage is as far as the wide screen can go
    w.wave = STAGE.waves.length - 1;
    w.locked = false;
    w.camMax = 1024;
    w.cam = 1023;
    p.x = 1300;
    run(w, 10);
    expect(w.fighters.some((f) => f.def === 'shogun')).toBe(true);
    expect(w.camMax).toBe(1024);
  });

  it('the plain 256 screen is unchanged', () => {
    const w = createWorld(11);
    expect(w.viewW).toBe(256);
    expect(snapshot(w).vw).toBe(256);
  });
});
