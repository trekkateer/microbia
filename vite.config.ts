import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3000', ws: true } } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
