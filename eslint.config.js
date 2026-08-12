import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Node built-ins `packages/core` may never import (Section 3.1: zero I/O).
 *
 * Phase 0 verification escaped an earlier, shorter list via `node:module` ->
 * createRequire, and via `node:sqlite`, `node:vm`, `node:v8` and others that
 * were simply missing. Enumerated exhaustively rather than by recollection.
 */
const NODE_BUILTINS = [
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'sqlite',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'test',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },

  {
    /* Section 0.2: the ban-list is not advisory. Blanket and next-line
       eslint-disable directives were shown during Phase 0 verification to
       defeat every rule below, so inline configuration is switched off
       entirely. If a rule genuinely needs an exception, it gets an ADR and a
       scoped override in this file — not a comment in the source. */
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
  },

  js.configs.recommended,

  /* ---- Type-aware linting, TypeScript sources only. ---- */
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* ---- Section 0.2.3: no escape hatches. ---- */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],

      /* ---- Section 0.2.4: never swallow an error. ---- */
      // `no-empty` alone is insufficient: it ignores any block containing a
      // comment, so `catch { /* ignored */ }` passed it. The selector below
      // catches an empty catch body regardless of comments.
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-empty-function': 'error',
      'no-unsafe-finally': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      /* ---- Section 6.6: determinism. ---- */
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Section 6.6: no randomness anywhere in the engine. If you need variability, take a seed as a parameter.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'Section 6.6: no wall-clock reads inside scoring. Pass timestamps in from the caller.',
        },
      ],

      /* ---- Section 0.2.2 + 0.2.3: banned syntax. ---- */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSUnknownKeyword, TSAsExpression > TSAnyKeyword',
          message:
            'Section 0.2.3: `as unknown as` / `as any` are forbidden. Narrow the type properly, or stop and ask.',
        },
        {
          // Covers both `describe.only` and computed `describe["only"]`.
          // Aliasing (`const d = describe`) and runtime `ctx.skip()` cannot be
          // caught syntactically — those are caught by allowOnly and by
          // scripts/assert-no-skipped-tests.mjs, which inspect the run result.
          selector:
            'MemberExpression[computed=false][property.name=/^(only|skip|todo|failing)$/][object.name=/^(describe|it|test|suite|bench)$/],' +
            'MemberExpression[computed=true][property.value=/^(only|skip|todo|failing)$/][object.name=/^(describe|it|test|suite|bench)$/]',
          message:
            'Section 0.2.2: .only / .skip / .todo are forbidden. Fix the test or fix the code, then log it in HONESTY_LOG.md.',
        },
        {
          selector: 'CatchClause > BlockStatement[body.length=0]',
          message:
            'Section 0.2.4: never swallow an error. Handle it, re-throw it, or log it with full context. A comment is not handling.',
        },
        {
          selector: "VariableDeclarator[init.name='Math'], VariableDeclarator[init.name='Date']",
          message:
            'Section 6.6: aliasing Math or Date defeats the determinism ban. Reference them directly so the restricted-property rules apply.',
        },
      ],

      /* ---- General hygiene. ---- */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  /* ---- Section 3.1: the core boundary, enforced not merely documented. ---- */
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      /* Static imports are only half the surface. Phase 0 verification reached
         the filesystem from inside core via `await import('node:fs')` and via
         ambient globals that need no import at all. */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message:
            'Section 3.1: dynamic import() is forbidden in packages/core — it is an I/O escape hatch that static import rules cannot see.',
        },
        {
          selector: "MemberExpression[object.name='globalThis']",
          message:
            'Section 3.1 / 6.6: reaching through globalThis bypasses the purity and determinism bans. packages/core takes everything it needs as a parameter.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Section 6.6: no wall-clock reads inside scoring. Pass timestamps in from the caller.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'Section 3.1: packages/core is pure. Pass configuration in as a parameter.',
        },
        {
          name: 'crypto',
          message:
            'Section 6.6: no randomness in the engine. The global crypto needs no import, which is exactly why it is banned here.',
        },
        {
          name: 'performance',
          message: 'Section 6.6: no clock reads inside scoring.',
        },
        {
          name: 'fetch',
          message: 'Section 3.1 / C5: the scoring path makes no network calls.',
        },
        {
          name: '__dirname',
          message: 'Section 3.1: packages/core has no filesystem awareness.',
        },
        {
          name: '__filename',
          message: 'Section 3.1: packages/core has no filesystem awareness.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_BUILTINS.flatMap((name) => [
            {
              name,
              message: `Section 3.1: packages/core is pure and does no I/O. "${name}" belongs in apps/server.`,
            },
            {
              name: `node:${name}`,
              message: `Section 3.1: packages/core is pure and does no I/O. "node:${name}" belongs in apps/server.`,
            },
          ]),
          patterns: [
            {
              group: ['@matchdesk/server', '@matchdesk/web', '**/apps/**'],
              message:
                'Section 3.1: packages/core must not depend on server or web. Dependencies point inward only.',
            },
          ],
        },
      ],
    },
  },

  /* ---- Build tooling: plain JS, no TS project owns it. ---- */
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
