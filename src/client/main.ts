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

  // Specials fire by themselves when the meter is full; the buttons exist only in the manual practice mode (/?manual).
  const q = new URLSearchParams(location.search);
  const manual = q.has('manual');
  const specialsEl = $('specials');
  if (manual) {
    for (const sp of SPECIALS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = `sp-${sp.id}`;
      b.title = sp.name;
      b.textContent = sp.name.slice(0, 2);
      specialsEl.appendChild(b);
      touchApi.bind(b, sp.bit);
    }
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
  const practice = { mp: Number(q.get('mp')) || 0, weapon: Number(q.get('weapon')) || 0, manual };
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
      if (manual) {
        specialsEl.classList.toggle('ready', ready);
        if (ready && !touch) hint = SPECIALS.map((x) => `[${x.id + 1}] ${x.name}`).join('  ');
      }
      if (!hint && session instanceof NetSession && snap && snap.sl.filter((s) => s.a).length < 2) {
        hint = '把網址傳給朋友，等他加入…';
      }
    }
    renderer.draw(snap, { mySlot: session?.mySlot() ?? 0, hint, now });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
