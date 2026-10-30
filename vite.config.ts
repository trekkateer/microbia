import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  appType: 'mpa',
  plugins: [{
    name: 'play-page',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/play\/?(?:\?|$)/.test(req.url)) req.url = req.url.replace(/^\/play\/?/, '/play/index.html');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/play\/?(?:\?|$)/.test(req.url)) req.url = req.url.replace(/^\/play\/?/, '/play/index.html');
        next();
      });
    },
  }],
  build: { rolldownOptions: { input: { home: resolve('index.html'), play: resolve('play/index.html') } } },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3000', ws: true } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
