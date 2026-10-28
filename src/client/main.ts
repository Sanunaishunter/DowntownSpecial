import './style.css';
import { SCREEN_H, SCREEN_W } from '../shared/constants';
import { TICK_RATE } from '../shared/constants';
import { SPECIALS } from '../shared/specials';
import { Assets } from './assets';
import { Input, setupTouch } from './input';
import { Music } from './music';
import { Renderer } from './render';
import { Sfx } from './sfx';
import { SKILL_ICONS } from './skillicons';
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

  // Six special buttons above A/B (keys 1-6 on a keyboard); each one cools down on its own after it is used.
  const q = new URLSearchParams(location.search);
  const specialsEl = $('specials');
  const spBtns = SPECIALS.map((sp) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `sp-${sp.id}`;
    b.className = `sp-${sp.key}`;
    b.title = `${sp.name} [${sp.id + 1}]`;
    b.innerHTML = `${SKILL_ICONS[sp.id]}<span class="cd"></span>`;
    specialsEl.appendChild(b);
    touchApi.bind(b, sp.bit);
    return { el: b, cd: b.querySelector('.cd') as HTMLElement, last: -1 };
  });

  const music = new Music();
  const sfx = new Sfx(() => music.node(), () => music.muted);
  const muteBtn = $('mute');
  const showMute = () => muteBtn.classList.toggle('off', music.muted);
  muteBtn.onclick = () => {
    music.setMuted(!music.muted);
    showMute();
  };
  showMute();

  const assets = new Assets();
  void assets.load();
  const renderer = new Renderer(canvas, assets);

  let scale = 2;
  const layout = () => {
    const vw = renderer.viewW;
    const fit = Math.max(0.1, Math.min(screen.clientWidth / vw, screen.clientHeight / SCREEN_H));
    canvas.style.width = `${vw * fit}px`;
    canvas.style.height = `${SCREEN_H * fit}px`;
    const s = Math.max(2, Math.min(6, Math.ceil(fit * (window.devicePixelRatio || 1))));
    if (s !== scale) {
      scale = s;
      renderer.setScale(s);
    }
  };
  new ResizeObserver(layout).observe(screen);
  renderer.onViewChange = layout;
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

  // Practice parameters for single-player: /?weapon=1..7 starts armed, /?stage=onsen starts at 溫泉關, /?stage=street at 健康素食保衛戰.
  const practice = { weapon: Number(q.get('weapon')) || 0, stage: q.get('stage') === 'onsen' ? 1 : q.get('stage') === 'street' ? 2 : 0, viewW: SCREEN_W };
  // /?wide: the picture fills the window and the controls float over it; the battlefield is as wide as the window is
  // (single-player only for now, as every player in a room has to see the same battlefield)
  const wide = q.has('wide');
  app.classList.toggle('wide', wide);
  $('btn-local').onclick = () => {
    if (wide) {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      practice.viewW = Math.max(SCREEN_W, Math.min(480, 2 * Math.round((SCREEN_H * aspect) / 2)));
    }
    start(new LocalSession(input, practice));
  };
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
      const fx = session.takeFx();
      renderer.addFx(fx, now);
      sfx.events(fx, now);
      netInfo.textContent = session.info();
      const mine = snap?.sl[session.mySlot()];
      const me = snap && mine ? snap.f.find((q) => q.i === mine.f) : undefined;
      SPECIALS.forEach((sp, n) => {
        const btn = spBtns[n];
        const left = me?.k[n] ?? 0;
        if (left === btn.last) return;
        btn.last = left;
        btn.el.classList.toggle('cooling', left > 0);
        btn.el.style.setProperty('--cd', String(left / sp.cooldown));
        btn.cd.textContent = left > 0 ? String(Math.ceil(left / TICK_RATE)) : '';
      });
      if (!hint && session instanceof NetSession && snap && snap.sl.filter((s) => s.a).length < 2) {
        hint = '把網址傳給朋友，等他加入…';
      }
    }
    sfx.scan(snap, now);
    // the tune follows the scene: the shogun's or the chief's fight, 溫泉關, the street, the road, and the menu while nobody is playing
    if (!snap) music.play(['menu', 'tokaido']);
    else if (snap.f.some((f) => (f.d === 'shogun' || f.d === 'chief') && f.h > 0)) music.play(['shogun', 'tokaido']);
    else music.play(snap.sg === 1 ? ['onsen', 'tokaido'] : snap.sg === 2 ? ['street', 'tokaido'] : ['tokaido']);
    renderer.draw(snap, { mySlot: session?.mySlot() ?? 0, hint, now });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
