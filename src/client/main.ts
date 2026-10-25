import './style.css';
import { SCREEN_H, SCREEN_W } from '../shared/constants';
import { MP_MAX, SPECIALS } from '../shared/specials';
import { Assets } from './assets';
import { Input, setupTouch } from './input';
import { Renderer } from './render';
import { LocalSession, NetSession, type Session } from './session';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const app = $('app');
  const screen = $('screen');
  const canvas = $<HTMLCanvasElement>('game');
  const menu = $('menu');
  const msg = $('msg');
  const netInfo = $('net');
  const leave = $('leave');
  const codeInput = $<HTMLInputElement>('code');
  $('ver').textContent = `版本 ${__APP_VERSION__}${__APP_DATE__ ? ` · ${__APP_DATE__}` : ''}`;

  // Reload once when the server runs a different build than this page (guarded against loops).
  const reloadIfStale = (serverVersion: string): boolean => {
    if (!serverVersion || serverVersion === 'dev' || serverVersion === __APP_VERSION__) return false;
    try {
      if (sessionStorage.getItem('eb-reload') === serverVersion) return false;
      sessionStorage.setItem('eb-reload', serverVersion);
    } catch {
      return false;
    }
    location.reload();
    return true;
  };

  const input = new Input();
  const touchApi = setupTouch(input);
  const touch = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search);
  app.classList.toggle('touch', touch);

  const specialsEl = $('specials');
  const ICONS: Record<string, string> = {
    beam: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9 3 4 8 4 14.5S9 27 16 27s12-6 12-12.5S23 3 16 3z" fill="#2f8a50" stroke="#fff" stroke-width="2"/><path d="M16 3v24M6 9l10 6 10-6M4 16h24M8 24l8-9 8 9" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
    volley: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="9" width="20" height="16" rx="5" fill="#f2b484" stroke="#fff" stroke-width="2"/><path d="M12 9v8M16 9v8M20 9v8M6 18h20" stroke="#8a4a20" stroke-width="1.6" fill="none"/></svg>',
  };
  for (const sp of SPECIALS.filter((x) => x.implemented)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `sp-${sp.id}`;
    b.title = sp.name;
    b.innerHTML = ICONS[sp.key] ?? sp.name;
    specialsEl.appendChild(b);
    touchApi.bind(b, sp.bit);
  }

  const assets = new Assets();
  void assets.load();
  const renderer = new Renderer(canvas, assets);

  let scale = 2;
  const layout = () => {
    const fit = Math.max(0.1, Math.min(screen.clientWidth / SCREEN_W, screen.clientHeight / SCREEN_H));
    canvas.style.width = `${SCREEN_W * fit}px`;
    canvas.style.height = `${SCREEN_H * fit}px`;
    const s = Math.max(2, Math.min(6, Math.ceil(fit * (window.devicePixelRatio || 1))));
    if (s !== scale) {
      scale = s;
      renderer.setScale(s);
    }
  };
  new ResizeObserver(layout).observe(screen);
  layout();

  let session: Session | null = null;

  const showMenu = (text = '') => {
    session?.close();
    session = null;
    menu.hidden = false;
    leave.hidden = true;
    netInfo.textContent = '';
    msg.textContent = text;
  };

  const start = (s: Session) => {
    session = s;
    menu.hidden = true;
    leave.hidden = false;
    msg.textContent = '';
  };

  const connect = async (mode: 'create' | 'join', code = '') => {
    msg.textContent = '連線中…';
    try {
      const s = await NetSession.connect(input, mode, code);
      s.onClose = (reason) => showMenu(reason);
      history.replaceState(null, '', `#${s.code}`);
      if (reloadIfStale(s.serverVersion)) {
        msg.textContent = '發現新版本，重新載入中…';
        return;
      }
      start(s);
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : '連線失敗';
    }
  };

  // Practice parameters for single-player: /?mp=100 starts with a full meter, /?weapon=1..5 starts armed.
  const q = new URLSearchParams(location.search);
  const practice = { mp: Number(q.get('mp')) || 0, weapon: Number(q.get('weapon')) || 0 };
  $('btn-local').onclick = () => start(new LocalSession(input, practice));
  $('btn-create').onclick = () => void connect('create');
  const join = () => {
    const code = codeInput.value.trim();
    if (code) void connect('join', code);
    else msg.textContent = '請輸入房間代碼';
  };
  $('btn-join').onclick = join;
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
  leave.onclick = () => {
    history.replaceState(null, '', location.pathname);
    showMenu();
  };

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || session) return;
    try {
      const v = await (await fetch('/version.json', { cache: 'no-store' })).json();
      reloadIfStale(v.id);
    } catch {
      /* offline: keep the current page */
    }
  });

  const hash = location.hash.replace('#', '').trim();
  if (hash) {
    codeInput.value = hash.toUpperCase();
    void connect('join', hash);
  }

  const frame = (now: number) => {
    let snap = null;
    let hint = '';
    if (session) {
      session.update(now);
      snap = session.view(now);
      renderer.addFx(session.takeFx(), now);
      netInfo.textContent = session.info();
      const mine = snap?.sl[session.mySlot()];
      const me = snap && mine ? snap.f.find((q) => q.i === mine.f) : undefined;
      const ready = !!me && me.e >= MP_MAX && me.s !== 18;
      specialsEl.classList.toggle('ready', ready);
      if (ready && !touch) hint = SPECIALS.filter((x) => x.implemented).map((x) => `[${x.id + 1}] ${x.name}`).join('   ');
      else if (session instanceof NetSession && snap && snap.sl.filter((s) => s.a).length < 2) {
        hint = '把網址傳給朋友，等他加入…';
      }
    }
    renderer.draw(snap, { mySlot: session?.mySlot() ?? 0, hint, now });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
