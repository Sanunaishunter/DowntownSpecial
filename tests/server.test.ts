import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Btn } from '../src/shared/constants';
import { parseClientMsg } from '../src/shared/protocol';
import { startServer, type RunningServer } from '../src/server/index';

let server: RunningServer;
let base = '';
let tmp = '';

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dts-'));
  fs.mkdirSync(path.join(tmp, 'dist'));
  fs.mkdirSync(path.join(tmp, 'assets'));
  fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<h1>hi</h1>');
  fs.writeFileSync(path.join(tmp, 'assets', 'a.json'), '{"ok":1}');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'nope');
  server = await startServer({
    port: 0,
    hosts: ['127.0.0.1'],
    distDir: path.join(tmp, 'dist'),
    assetsDir: path.join(tmp, 'assets'),
  });
  base = `127.0.0.1:${server.ports[0]}`;
});

afterAll(async () => {
  await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function connect(origin?: string) {
  const ws = new WebSocket(`ws://${base}/ws`, { origin });
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const opened = new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    ws.once('unexpected-response', (_req, r) => rej(new Error(`status ${r.statusCode}`)));
  });
  const waitFor = async (pred: (m: any) => boolean, ms = 3000) => {
    const t0 = Date.now();
    for (;;) {
      const m = msgs.find(pred);
      if (m) return m;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for message');
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  return { ws, msgs, opened, waitFor };
}

function get(p: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://${base}${p}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      })
      .on('error', reject);
  });
}

describe('http', () => {
  it('serves index and assets, with security headers', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('hi');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    const a = await get('/assets/a.json');
    expect(a.status).toBe(200);
  });

  it('blocks path traversal', async () => {
    const r = await new Promise<number>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: server.ports[0], path: '/assets/../secret.txt', method: 'GET' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end();
    });
    expect([403, 404]).toContain(r);
    const enc = await get('/assets/%2e%2e/secret.txt');
    expect([403, 404]).toContain(enc.status);
    expect(enc.body).not.toContain('nope');
  });
});

describe('websocket', () => {
  it('two clients can create/join a room and receive snapshots', async () => {
    const a = connect();
    await a.opened;
    a.ws.send(JSON.stringify({ t: 'create' }));
    const joinedA = await a.waitFor((m) => m.t === 'joined');
    expect(joinedA.slot).toBe(0);
    expect(joinedA.code).toMatch(/^[A-Z0-9]{6}$/);

    const b = connect();
    await b.opened;
    b.ws.send(JSON.stringify({ t: 'join', code: joinedA.code.toLowerCase() }));
    const joinedB = await b.waitFor((m) => m.t === 'joined');
    expect(joinedB.slot).toBe(1);

    const snap = await b.waitFor((m) => m.t === 's' && m.sl[0].a === 1 && m.sl[1].a === 1);
    expect(snap.f.filter((f: any) => f.d === 'kunimasa' || f.d === 'rikigoro').length).toBe(2);

    const x0 = (await a.waitFor((m) => m.t === 's')).f.find((f: any) => f.d === 'kunimasa').x;
    a.ws.send(JSON.stringify({ t: 'in', h: Btn.Left | Btn.Up, p: 0 }));
    await a.waitFor((m) => m.t === 's' && m.f.find((f: any) => f.d === 'kunimasa' && f.x < x0 - 8));
    a.ws.send(JSON.stringify({ t: 'in', h: 0, p: 0 }));

    const c = connect();
    await c.opened;
    c.ws.send(JSON.stringify({ t: 'join', code: joinedA.code }));
    const err = await c.waitFor((m) => m.t === 'err');
    expect(err.msg).toContain('滿');

    a.ws.send(JSON.stringify({ t: 'ping', n: 5 }));
    expect((await a.waitFor((m) => m.t === 'pong')).n).toBe(5);

    for (const x of [a, b, c]) x.ws.close();
  });

  it('rejects unknown rooms', async () => {
    const a = connect();
    await a.opened;
    a.ws.send(JSON.stringify({ t: 'join', code: 'NOPE00' }));
    expect((await a.waitFor((m) => m.t === 'err')).msg).toContain('找不到');
    a.ws.close();
  });

  it('rejects cross-origin websocket upgrades', async () => {
    const x = connect('http://evil.example');
    await expect(x.opened).rejects.toThrow(/403/);
  });

  it('accepts same-origin upgrades', async () => {
    const x = connect(`http://${base}`);
    await x.opened;
    x.ws.close();
  });

  it('ignores garbage and closes oversize frames', async () => {
    const a = connect();
    await a.opened;
    a.ws.send('not json');
    a.ws.send(JSON.stringify({ t: 'in', h: 9999, p: -1 }));
    a.ws.send(JSON.stringify({ t: 'create' }));
    await a.waitFor((m) => m.t === 'joined');
    const closed = new Promise<number>((res) => a.ws.once('close', (code) => res(code)));
    a.ws.send('x'.repeat(5000));
    expect(await closed).toBe(1009);
  });
});

describe('protocol', () => {
  it('validates messages', () => {
    expect(parseClientMsg('{"t":"in","h":63,"p":0}')).toEqual({ t: 'in', h: 63, p: 0 });
    expect(parseClientMsg('{"t":"in","h":64,"p":0}')).toBeNull();
    expect(parseClientMsg('{"t":"in","h":1.5,"p":0}')).toBeNull();
    expect(parseClientMsg('{"t":"join","code":123}')).toBeNull();
    expect(parseClientMsg('{"t":"nope"}')).toBeNull();
    expect(parseClientMsg('[]')).toBeNull();
  });
});
