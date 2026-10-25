import { describe, expect, it } from 'vitest';
import { Btn } from '../src/shared/constants';
import { addPlayer, createWorld, snapshot, step } from '../src/shared/sim';
import { AURA, BEAM, MP_MAX, SHIELD, SP, SPECIALS, VOLLEY } from '../src/shared/specials';
import { St, type Fighter, type PlayerInput, type World } from '../src/shared/types';
import { WEAPONS, WID } from '../src/shared/weapons';

const none: PlayerInput = { held: 0, pressed: 0 };

function setup(seed = 11, manual = true) {
  const w = createWorld(seed);
  w.manual = manual;
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

// Which special fired right after the meter filled (read from what it started).
function fired(p: Fighter) {
  const ids: number[] = [];
  if (p.st === St.Beam) ids.push(SP.Beam);
  if (p.volley > 0) ids.push(SP.Volley);
  if (p.halo > 0) ids.push(SP.Halo);
  if (p.aura > 0) ids.push(SP.Aura);
  if (p.shield > 0) ids.push(SP.Shield);
  return ids;
}

describe('random specials', () => {
  it('a full meter fires one special by itself, and all of them can come up', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const w = setup(seed, false);
      const p = player(w);
      p.hp = 40;
      p.mp = MP_MAX;
      run(w, 2);
      const ids = fired(p);
      expect(ids.length).toBeGreaterThan(0);
      if (ids.length === 5) seen.add(SP.Ultimate);
      else {
        expect(ids.length).toBe(1);
        seen.add(ids[0]);
      }
      expect(p.sp.some((c) => c > 0)).toBe(true);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('does not fire without a full meter, and waits while another special runs', () => {
    const w = setup(5, false);
    const p = player(w);
    p.mp = MP_MAX - 1;
    run(w, 20);
    expect(fired(p)).toEqual([]);
    p.mp = MP_MAX;
    run(w, 1);
    const first = fired(p);
    expect(first.length).toBeGreaterThan(0);
    p.mp = MP_MAX;
    const sp = [...p.sp];
    run(w, 1);
    expect(p.sp).toEqual(sp.map((c) => Math.max(0, c - 1)));
  });

  it('a special that is cooling down is never picked again', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const w = setup(seed, false);
      const p = player(w);
      p.hp = 10;
      p.sp = [0, 0, 0, 0, 0, 0].map((_, i) => (i === SP.Halo || i === SP.Ultimate ? 0 : 500));
      p.mp = MP_MAX;
      run(w, 2);
      expect(fired(p).length).toBeGreaterThan(0);
      expect(p.halo > 0 || p.sp[SP.Ultimate] > 400).toBe(true);
    }
  });

  it('cooldowns run down and the special can come back', () => {
    const w = setup(3, false);
    const p = player(w);
    p.sp = [1, 1, 1, 1, 1, 1].map((c, i) => (i === SP.Aura ? 3 : c));
    run(w, 5);
    expect(p.sp.every((c) => c === 0)).toBe(true);
  });

  it('a hurt hero is far more likely to be healed than a healthy one', () => {
    let hurt = 0;
    let fine = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const [hp, set] of [[30, 'hurt'], [100, 'fine']] as const) {
        const w = setup(seed, false);
        const p = player(w);
        p.hp = hp;
        p.mp = MP_MAX;
        run(w, 2);
        if (p.halo > 0 && fired(p).length === 1) set === 'hurt' ? hurt++ : fine++;
      }
    }
    expect(hurt).toBeGreaterThan(fine * 2);
  });
});

describe('光環 / 爆氣 / 聖盾 / 主角威能', () => {
  const trigger = (w: World, bit: number) => {
    player(w).mp = MP_MAX;
    press(w, bit);
  };

  it('光環 refills health at once', () => {
    const w = setup();
    const p = player(w);
    p.hp = 7;
    trigger(w, Btn.S3);
    expect(p.hp).toBe(p.maxHp);
    expect(p.halo).toBeGreaterThan(0);
    expect(p.mp).toBe(0);
    expect(p.sp[SP.Halo]).toBeGreaterThan(0);
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

  it('主角威能 wipes the cooldowns and fires everything at once', () => {
    const w = setup();
    const p = player(w);
    p.hp = 20;
    p.sp = [900, 900, 900, 900, 900, 0];
    p.face = 1;
    trigger(w, Btn.S6);
    expect(p.hp).toBe(p.maxHp);
    expect(p.st).toBe(St.Beam);
    expect(p.volley).toBeGreaterThan(0);
    expect(p.aura).toBeGreaterThan(0);
    expect(p.shield).toBeGreaterThan(0);
    for (const s of SPECIALS) expect(p.sp[s.id]).toBe(s.cooldown);
  });

  it('shows the buffs and cooldowns in the snapshot', () => {
    const w = setup();
    trigger(w, Btn.S4);
    const f = snapshot(w).f.find((q) => q.d === 'ichiro')!;
    expect(f.b & 1).toBe(1);
    expect(f.k & (1 << SP.Aura)).toBeTruthy();
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
