import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Covers the pure logic layer only (lib/format, lib/errors, and similar) —
 * not components. Those depend on react-native-web's runtime and are better
 * served by jest-expo + React Native Testing Library, which is a separate,
 * heavier setup this doesn't attempt to be. Start cheap and real; expand
 * later if UI-level regressions turn out to be the ones that keep slipping
 * through.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
