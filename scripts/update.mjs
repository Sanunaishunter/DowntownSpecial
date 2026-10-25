// Runs before the server starts: pull the latest version, reinstall and rebuild when needed.
// It never blocks startup: any problem just prints a note and the current version is used.
// Skip with NO_UPDATE=1.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion } from './version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const say = (m) => console.log(`[更新] ${m}`);

const git = (...args) =>
  spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
const out = (r) => (r.stdout ?? '').trim();

let needInstall = false;

function sync() {
  if (git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').status !== 0) {
    say('目前分支沒有設定上游分支，略過更新。');
    return;
  }
  if (git('fetch', '--quiet').status !== 0) {
    say('連不上 GitHub，使用目前版本。');
    return;
  }
  const behind = Number(out(git('rev-list', '--count', 'HEAD..@{u}')));
  if (!behind) {
    say(`已是最新版 ${getVersion().id}`);
    return;
  }
  if (out(git('status', '--porcelain', '--untracked-files=no'))) {
    say(`有 ${behind} 個新提交可更新，但本機有改過的檔案，已略過。（要更新請先還原或 git stash）`);
    return;
  }
  const before = out(git('rev-parse', 'HEAD'));
  if (git('merge', '--ff-only', '@{u}').status !== 0) {
    say('本機分支與遠端分歧，無法自動更新，已略過。');
    return;
  }
  const changed = out(git('diff', '--name-only', before, 'HEAD')).split('\n');
  if (changed.includes('package.json') || changed.includes('package-lock.json')) needInstall = true;
  say(`已更新 ${behind} 個提交 → ${getVersion().id}`);
}

function run(args, what) {
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) say(`${what}失敗，將使用現有檔案繼續。`);
  return r.status === 0;
}

if (process.env.NO_UPDATE) {
  say('已略過自動更新（NO_UPDATE）。');
} else {
  if (existsSync(path.join(root, '.git'))) sync();
  else say('這個資料夾不是 git 專案，無法自動更新。');

  if (needInstall || !existsSync(path.join(root, 'node_modules'))) {
    say('安裝套件…');
    run(['install', '--no-audit', '--no-fund'], '安裝套件');
  }

  let built = '';
  try {
    built = JSON.parse(readFileSync(path.join(root, 'dist', 'version.json'), 'utf8')).id;
  } catch {
    /* not built yet */
  }
  const want = getVersion().id;
  if (built !== want) {
    say(`建置 ${want}…`);
    run(['run', 'build'], '建置');
  }
}
