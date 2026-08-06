import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // The engine modules are pure: no DOM, no database, no network.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // delta-t.ts depends on the runtime's IANA zone data; pin the ambient zone so a developer's
    // local TZ can never change a test outcome.
    env: { TZ: 'UTC' },
  },
});
