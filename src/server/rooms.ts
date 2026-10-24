import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { BTN_ALL, MAX_PLAYERS, SNAPSHOT_EVERY } from '../shared/constants';
import { addPlayer, createWorld, removePlayer, snapshot, step } from '../shared/sim';
import type { PlayerInput, World } from '../shared/types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 20;
const EMPTY_ROOM_TTL_MS = 120_000;
const MAX_BUFFERED = 256 * 1024;

export interface Client {
  ws: WebSocket;
  room: Room | null;
  slot: number;
  tokens: number;
  lastRefill: number;
}

export class Room {
  readonly world: World;
  readonly clients: (Client | null)[] = Array.from({ length: MAX_PLAYERS }, () => null);
  private readonly inputs: PlayerInput[] = Array.from({ length: MAX_PLAYERS }, () => ({ held: 0, pressed: 0 }));
  emptySince = Date.now();

  constructor(readonly code: string) {
    this.world = createWorld((Math.random() * 2 ** 31) | 0);
  }

  get playerCount() {
    return this.clients.filter(Boolean).length;
  }

  join(c: Client): number {
    const slot = this.clients.findIndex((x) => x === null);
    if (slot < 0) return -1;
    this.clients[slot] = c;
    c.room = this;
    c.slot = slot;
    this.inputs[slot] = { held: 0, pressed: 0 };
    addPlayer(this.world, slot);
    return slot;
  }

  leave(c: Client) {
    if (c.room !== this) return;
    this.clients[c.slot] = null;
    removePlayer(this.world, c.slot);
    this.inputs[c.slot] = { held: 0, pressed: 0 };
    c.room = null;
    if (this.playerCount === 0) this.emptySince = Date.now();
  }

  setInput(slot: number, held: number, pressed: number) {
    const inp = this.inputs[slot];
    inp.held = held & BTN_ALL;
    inp.pressed |= pressed & BTN_ALL;
  }

  tick() {
    if (this.playerCount === 0) return;
    step(this.world, this.inputs);
    for (const i of this.inputs) i.pressed = 0;
    if (this.world.tick % SNAPSHOT_EVERY === 0) this.broadcastSnapshot();
  }

  private broadcastSnapshot() {
    const msg = JSON.stringify({ t: 's', ...snapshot(this.world) });
    for (const c of this.clients) {
      if (!c || c.ws.readyState !== c.ws.OPEN) continue;
      if (c.ws.bufferedAmount > MAX_BUFFERED) continue;
      c.ws.send(msg);
    }
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  create(): Room | null {
    this.sweep();
    if (this.rooms.size >= MAX_ROOMS) return null;
    let code = '';
    do {
      const bytes = randomBytes(6);
      code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string) {
    return this.rooms.get(code);
  }

  tick() {
    for (const r of this.rooms.values()) r.tick();
  }

  sweep() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (r.playerCount === 0 && now - r.emptySince > EMPTY_ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  get size() {
    return this.rooms.size;
  }
}
