import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    /* Tests must exercise SOURCE, never a build artifact. Without these aliases
       `@matchdesk/shared` resolves through its exports map to dist/, so a stale
       build would be silently tested and src/ would be invisible to coverage. */
    alias: {
      '@matchdesk/shared': src('./packages/shared/src/index.ts'),
      '@matchdesk/core': src('./packages/core/src/index.ts'),
    },
  },
  test: {
    globals: false,
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['{apps,packages}/*/src/**/*.ts'],
      /* Exclude barrels by explicit path, never by `**./index.ts` glob — a glob
         would silently exempt any future index.ts that contains real logic. */
      exclude: ['**/*.test.ts', '**/dist/**', 'packages/core/src/index.ts'],
      all: true,
      thresholds: {
        // Section 9.1. These fail the build, they do not warn.
        lines: 75,
        branches: 75,
        functions: 75,
        statements: 75,
        'packages/core/src/**': {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
