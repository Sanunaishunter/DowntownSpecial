import { defineConfig, type Plugin } from 'vite';
import { getVersion } from './scripts/version.mjs';

const version = getVersion();

const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(version) });
  },
});

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version.id),
    __APP_DATE__: JSON.stringify(version.date),
  },
  plugins: [versionFile()],
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'bundle' },
  server: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
      '/assets': 'http://127.0.0.1:8080',
    },
  },
});
