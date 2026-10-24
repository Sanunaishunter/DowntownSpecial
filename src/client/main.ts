import './style.css';
import { SCREEN_H, SCREEN_W } from '../shared/constants';
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

  const input = new Input();
  setupTouch(input);
  const touch = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search);
  app.classList.toggle('touch', touch);

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
      start(s);
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : '連線失敗';
    }
  };

  $('btn-local').onclick = () => start(new LocalSession(input));
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
      if (session instanceof NetSession && snap && snap.sl.filter((s) => s.a).length < 2) {
        hint = '把網址傳給朋友，等他加入…';
      }
    }
    renderer.draw(snap, { mySlot: session?.mySlot() ?? 0, hint, now });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
