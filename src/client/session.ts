import { TICK_MS } from '../shared/constants';
import { addPlayer, createWorld, snapshot, step } from '../shared/sim';
import type { GameEvent, Snapshot, World } from '../shared/types';
import { WEAPONS } from '../shared/weapons';
import type { Input } from './input';

export interface Session {
  update(now: number): void;
  view(now: number): Snapshot | null;
  takeFx(): GameEvent[];
  info(): string;
  mySlot(): number;
  close(): void;
}

export class LocalSession implements Session {
  private world: World;
  private last = performance.now();
  private acc = 0;
  private snap: Snapshot | null = null;
  private fx: GameEvent[] = [];

  constructor(
    private input: Input,
    practice: { mp?: number; weapon?: number } = {},
  ) {
    this.world = createWorld((Math.random() * 2 ** 31) | 0);
    addPlayer(this.world, 0);
    const me = this.world.fighters[0];
    if (practice.mp) me.mp = Math.min(100, practice.mp);
    const wd = practice.weapon ? WEAPONS[practice.weapon] : undefined;
    if (wd) {
      me.weapon = wd.id;
      me.wn = wd.uses;
    }
    this.snap = snapshot(this.world);
  }

  update(now: number) {
    this.acc = Math.min(this.acc + (now - this.last), 250);
    this.last = now;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      step(this.world, [this.input.take()]);
      this.snap = snapshot(this.world);
      for (const e of this.snap.ev) this.fx.push(e);
    }
  }

  view() {
    return this.snap;
  }

  takeFx() {
    const f = this.fx;
    this.fx = [];
    return f;
  }

  info() {
    return '單人練習';
  }

  mySlot() {
    return 0;
  }

  close() {}
}

const INTERP_MS = 90;

interface Stamped {
  t: number;
  s: Snapshot;
}

export class NetSession implements Session {
  private ws: WebSocket;
  private buf: Stamped[] = [];
  private fx: GameEvent[] = [];
  private lastHeld = -1;
  private rtt = 0;
  private pingTimer = 0;
  private slot = -1;
  code = '';
  serverVersion = '';
  onClose: (reason: string) => void = () => {};

  private constructor(
    private input: Input,
    ws: WebSocket,
  ) {
    this.ws = ws;
  }

  static connect(input: Input, mode: 'create' | 'join', code = ''): Promise<NetSession> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      const sess = new NetSession(input, ws);
      let settled = false;
      const fail = (msg: string) => {
        if (settled) {
          sess.onClose(msg);
          return;
        }
        settled = true;
        reject(new Error(msg));
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
      ws.onopen = () => ws.send(JSON.stringify(mode === 'create' ? { t: 'create' } : { t: 'join', code }));
      ws.onerror = () => fail('無法連到伺服器');
      ws.onclose = () => fail('與伺服器斷線');
      ws.onmessage = (ev) => {
        let m: any;
        try {
          m = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (m.t === 'joined' && !settled) {
          settled = true;
          sess.code = m.code;
          sess.slot = m.slot;
          sess.serverVersion = typeof m.ver === 'string' ? m.ver : '';
          sess.startPing();
          resolve(sess);
        } else if (m.t === 'err') {
          fail(m.msg ?? '錯誤');
        } else if (m.t === 's') {
          sess.onSnapshot(m as Snapshot);
        } else if (m.t === 'pong') {
          sess.rtt = Math.round(performance.now() - m.n);
        }
      };
    });
  }

  private startPing() {
    const ping = () => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'ping', n: performance.now() }));
    };
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }

  private onSnapshot(s: Snapshot) {
    this.buf.push({ t: performance.now(), s });
    if (this.buf.length > 30) this.buf.shift();
    for (const e of s.ev) this.fx.push(e);
  }

  update() {
    const inp = this.input.take();
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (inp.held !== this.lastHeld || inp.pressed !== 0) {
      this.lastHeld = inp.held;
      this.ws.send(JSON.stringify({ t: 'in', h: inp.held, p: inp.pressed }));
    }
  }

  view(now: number): Snapshot | null {
    const buf = this.buf;
    if (buf.length === 0) return null;
    const rt = now - INTERP_MS;
    while (buf.length > 2 && buf[1].t <= rt) buf.shift();
    const a = buf[0];
    const b = buf[1];
    if (!b) return a.s;
    const k = Math.max(0, Math.min(1, (rt - a.t) / Math.max(1, b.t - a.t)));
    return lerpSnap(a.s, b.s, k);
  }

  takeFx() {
    const f = this.fx;
    this.fx = [];
    return f;
  }

  info() {
    return `房間 ${this.code}　延遲 ${this.rtt}ms`;
  }

  mySlot() {
    return this.slot;
  }

  close() {
    window.clearInterval(this.pingTimer);
    this.ws.onclose = null;
    this.ws.close();
  }
}

function lerpSnap(a: Snapshot, b: Snapshot, k: number): Snapshot {
  const prev = new Map(a.f.map((f) => [f.i, f]));
  const pitems = new Map(a.it.map((i) => [i.i, i]));
  const mix = (p: number, q: number) => p + (q - p) * k;
  return {
    ...b,
    c: Math.abs(b.c - a.c) > 80 ? b.c : mix(a.c, b.c),
    f: b.f.map((f) => {
      const p = prev.get(f.i);
      if (!p || Math.abs(f.x - p.x) > 70 || Math.abs(f.y - p.y) > 70) return f;
      return { ...f, x: mix(p.x, f.x), y: mix(p.y, f.y), z: mix(p.z, f.z) };
    }),
    it: b.it.map((i) => {
      const p = pitems.get(i.i);
      if (!p || Math.abs(i.x - p.x) > 70) return i;
      return { ...i, x: mix(p.x, i.x), y: mix(p.y, i.y), z: mix(p.z, i.z) };
    }),
  };
}
