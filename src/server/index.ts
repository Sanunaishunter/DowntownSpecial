import fs from 'node:fs';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK_MS } from '../shared/constants';
import { parseClientMsg } from '../shared/protocol';
import { RoomManager, type Client } from './rooms';

export interface ServerOptions {
  port: number;
  hosts: string[];
  distDir: string;
  assetsDir: string;
  log?: (msg: string) => void;
}

export interface RunningServer {
  ports: number[];
  close(): Promise<void>;
}

const MAX_CONNECTIONS = 16;
const MAX_MSG_BYTES = 512;
const RATE_PER_SEC = 240;
const RATE_BURST = 480;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-cache',
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

export function tailscaleAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4') continue;
      const [p, q] = a.address.split('.').map(Number);
      if (p === 100 && q >= 64 && q <= 127) out.push(a.address);
    }
  }
  return out;
}

export function resolveHosts(env: string | undefined, log: (m: string) => void): string[] {
  if (env && env.trim()) {
    return env
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const ts = tailscaleAddresses();
  if (ts.length === 0) {
    log('[warn] 沒偵測到 Tailscale 網路介面，只綁定 127.0.0.1（朋友連不上）。請先啟動 Tailscale，或用 HOST=0.0.0.0 開放所有介面（不建議）。');
  }
  return ['127.0.0.1', ...ts];
}

function safeResolve(root: string, rel: string): string | null {
  const full = path.resolve(root, rel);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function serveStatic(opts: ServerOptions, req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let root = opts.distDir;
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (pathname.startsWith('/assets/')) {
    root = opts.assetsDir;
    rel = pathname.slice('/assets/'.length);
  }
  const full = safeResolve(root, rel);
  if (!full) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      if (pathname === '/assets/manifest.json') {
        res.writeHead(200, { 'Content-Type': MIME['.json'], ...SECURITY_HEADERS }).end('{}');
        return;
      }
      const hint = pathname === '/' ? 'Not built yet. Run: npm run build' : 'Not found';
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end(hint);
      return;
    }
    const type = MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...SECURITY_HEADERS });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(full).pipe(res);
  });
}

function originAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? (() => {});
  const rooms = new RoomManager();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES, perMessageDeflate: false });
  let connections = 0;

  wss.on('connection', (ws: WebSocket) => {
    const client: Client = { ws, room: null, slot: -1, tokens: RATE_BURST, lastRefill: Date.now() };
    const send = (o: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o));
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      client.tokens = Math.min(RATE_BURST, client.tokens + ((now - client.lastRefill) / 1000) * RATE_PER_SEC);
      client.lastRefill = now;
      if (--client.tokens < 0) {
        ws.close(1008, 'rate limit');
        return;
      }
      const msg = parseClientMsg(data.toString());
      if (!msg) return;
      switch (msg.t) {
        case 'ping':
          send({ t: 'pong', n: msg.n });
          break;
        case 'in':
          if (client.room) client.room.setInput(client.slot, msg.h, msg.p);
          break;
        case 'create': {
          if (client.room) return;
          const room = rooms.create();
          if (!room) {
            send({ t: 'err', msg: '房間數量已達上限' });
            return;
          }
          const slot = room.join(client);
          log(`room ${room.code} created`);
          send({ t: 'joined', code: room.code, slot });
          break;
        }
        case 'join': {
          if (client.room) return;
          const room = rooms.get(msg.code);
          if (!room) {
            send({ t: 'err', msg: '找不到這個房間代碼' });
            return;
          }
          const slot = room.join(client);
          if (slot < 0) {
            send({ t: 'err', msg: '房間已滿（最多 2 人）' });
            return;
          }
          log(`room ${room.code} joined slot ${slot}`);
          send({ t: 'joined', code: room.code, slot });
          break;
        }
      }
    });

    ws.on('close', () => {
      connections--;
      client.room?.leave(client);
    });
    ws.on('error', () => ws.terminate());
  });

  const onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!originAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (connections >= MAX_CONNECTIONS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      connections++;
      wss.emit('connection', ws, req);
    });
  };

  const servers = opts.hosts.map((host) => {
    const s = http.createServer((req, res) => serveStatic(opts, req, res));
    s.on('upgrade', onUpgrade);
    return { s, host };
  });

  let last = performance.now();
  let acc = 0;
  let sweepAt = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc = Math.min(acc + (now - last), 250);
    last = now;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      rooms.tick();
    }
    if (now > sweepAt) {
      sweepAt = now + 30_000;
      rooms.sweep();
    }
  }, 4);

  return new Promise((resolve, reject) => {
    const ports: number[] = [];
    let pending = servers.length;
    for (const { s, host } of servers) {
      s.once('error', reject);
      s.listen(opts.port, host, () => {
        const addr = s.address();
        ports.push(typeof addr === 'object' && addr ? addr.port : opts.port);
        log(`listening on http://${host}:${ports[ports.length - 1]}/`);
        if (--pending === 0) {
          resolve({
            ports,
            close: () =>
              new Promise<void>((done) => {
                clearInterval(loop);
                for (const c of wss.clients) c.terminate();
                wss.close();
                let n = servers.length;
                for (const { s: srv } of servers) {
                  srv.close(() => {
                    if (--n === 0) done();
                  });
                  srv.closeAllConnections();
                }
              }),
          });
        }
      });
    }
  });
}
