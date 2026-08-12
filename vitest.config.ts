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

    /* Section 0.2.2, first line of defence: a `.only` anywhere fails the run
       outright rather than quietly narrowing it. Enforced by the runner, so
       aliasing `describe` does not evade it. The second line of defence is
       scripts/assert-no-skipped-tests.mjs, which inspects the result. */
    allowOnly: false,

    reporters: ['default', ['json', { outputFile: './coverage/test-results.json' }]],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['{apps,packages}/*/src/**/*.ts'],
      /* Barrels are NOT excluded. An earlier config exempted them by name,
         which left a path where real logic could live unmeasured. */
      exclude: ['**/*.test.ts', '**/dist/**'],
      /* Vitest 4 removed `coverage.all` — files matching `include` are always
         measured whether or not a test imported them. Typechecking this file
         is what surfaced the dead option; it had been silently ignored. */
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
