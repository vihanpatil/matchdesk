import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Node built-ins `packages/core` may never import (Section 3.1: zero I/O). */
const NODE_BUILTINS = [
  'fs',
  'fs/promises',
  'path',
  'os',
  'http',
  'https',
  'net',
  'crypto',
  'child_process',
  'worker_threads',
  'stream',
  'url',
  'zlib',
  'dns',
  'tls',
  'cluster',
  'process',
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
          selector:
            'MemberExpression[property.name=/^(only|skip|todo|concurrent)$/][object.name=/^(describe|it|test|suite|bench)$/]',
          message:
            'Section 0.2.2: .only / .skip / .todo are forbidden. Fix the test or fix the code, then log it in HONESTY_LOG.md.',
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
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
