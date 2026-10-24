import { describe, expect, it } from 'vitest';
import { Btn } from '../src/shared/constants';
import { addPlayer, createWorld, step } from '../src/shared/sim';
import { St, type Fighter, type PlayerInput, type World } from '../src/shared/types';

function botInput(w: World, me: Fighter, n: number): PlayerInput {
  if (me.st === St.Dead) return { held: 0, pressed: 0 };
  const foes = w.fighters.filter((f) => f.kind !== 'player' && f.st !== St.Dead && f.heldBy === 0);
  const standing = foes.filter((f) => f.st !== St.Down && f.st !== St.GetUp);
  const pool = standing.length ? standing : foes;
  let held = 0;
  let pressed = 0;
  if (pool.length === 0) return { held: Btn.Right, pressed: 0 };
  let tgt = pool[0];
  for (const f of pool) if (Math.abs(f.x - me.x) + Math.abs(f.y - me.y) < Math.abs(tgt.x - me.x) + Math.abs(tgt.y - me.y)) tgt = f;
  const dx = tgt.x - me.x;
  const dy = tgt.y - me.y;
  if (Math.abs(dy) > 4) held |= dy > 0 ? Btn.Down : Btn.Up;
  if (Math.abs(dx) > 20) held |= dx > 0 ? Btn.Right : Btn.Left;
  else if (Math.abs(dx) < 8) held |= dx > 0 ? Btn.Left : Btn.Right;
  const facing = (dx >= 0 ? 1 : -1) === me.face;
  if (Math.abs(dx) <= 24 && Math.abs(dy) <= 6 && n % 13 === 0 && (facing || Math.abs(dx) < 8)) {
    pressed = Math.floor(n / 13) % 3 === 2 ? Btn.B : Btn.A;
    if (!facing) held |= dx >= 0 ? Btn.Right : Btn.Left;
  }
  return { held: held | pressed, pressed };
}

function simulate(players: number, seed: number) {
  const w = createWorld(seed);
  for (let i = 0; i < players; i++) addPlayer(w, i);
  let n = 0;
  while (n < 60 * 60 * 6 && w.status === 0) {
    const inputs = [0, 1].slice(0, players).map((slot) => {
      const me = w.fighters.find((f) => f.kind === 'player' && f.slot === slot)!;
      return botInput(w, me, n);
    });
    step(w, inputs);
    n++;
  }
  return { status: w.status, seconds: Math.round(n / 60), wave: w.wave, lives: w.slots.map((s) => s.lives), score: w.slots.map((s) => s.score) };
}

describe('bot playthrough (balance sanity)', () => {
  it('two simple bots can finish the stage', () => {
    const results = [1, 2, 3, 4, 5].map((seed) => simulate(2, seed));
    console.log('2P bots:', JSON.stringify(results));
    expect(results.filter((r) => r.status === 1).length).toBeGreaterThanOrEqual(3);
  });

  it('a lone bot makes real progress', () => {
    const results = [1, 2, 3].map((seed) => simulate(1, seed));
    console.log('1P bots:', JSON.stringify(results));
    expect(Math.max(...results.map((r) => r.wave))).toBeGreaterThanOrEqual(2);
  });
});
