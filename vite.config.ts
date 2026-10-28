import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
