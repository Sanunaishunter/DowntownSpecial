import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'bundle' },
  server: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
      '/assets': 'http://127.0.0.1:8080',
    },
  },
});
