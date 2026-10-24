import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHosts, startServer } from './index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const log = (m: string) => console.log(m);

const port = Number(process.env.PORT ?? 8080);
const hosts = resolveHosts(process.env.HOST, log);

const server = await startServer({
  port,
  hosts,
  distDir: path.join(root, 'dist'),
  assetsDir: path.join(root, 'assets'),
  log,
});

console.log('');
console.log('熱血時代劇 伺服器已啟動。朋友請用 Tailscale 位址開啟：');
for (const h of hosts) console.log(`  http://${h}:${server.ports[0]}/`);
console.log('');

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
