// Flat config wired directly against the Next + React plugins. Bypasses
// eslint-config-next's @rushstack/eslint-patch shim, which doesn't recognise
// ESLint 9 and breaks `pnpm lint`.
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactCompiler from 'eslint-plugin-react-compiler'
import importPlugin from 'eslint-plugin-import'
import betterTailwind from 'eslint-plugin-better-tailwindcss'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'
import localPlugin from './eslint-plugins/index.mjs'

const NEXT_FILE_CONVENTIONS = [
  'page',
  'layout',
  'error',
  'global-error',
  'loading',
  'not-found',
  'template',
  'default',
]

const NEXT_DEFAULT_EXPORT_FILES = [
  ...NEXT_FILE_CONVENTIONS.map((name) => `app/**/${name}.{ts,tsx}`),
  'app/**/route.ts',
  'app/**/opengraph-image.{ts,tsx}',
  'app/**/icon.{ts,tsx}',
  'app/**/apple-icon.{ts,tsx}',
  'app/**/sitemap.ts',
  'app/**/robots.ts',
  'app/**/manifest.ts',
  '*.config.{js,mjs,cjs,ts}',
  'next.config.{js,mjs,cjs,ts}',
]

const config = tseslint.config(
  {
    ignores: [
      '.next/**',
      '.worktrees/**',
      'node_modules/**',
      'lib/db/migrations/**',
      'data/**',
      'next-env.d.ts',
      'eslint-plugins/**',
      'stylelint-plugins/**',
    ],
  },
  { files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'] },
  tseslint.configs.recommended,
  nextPlugin.flatConfig.coreWebVitals,
  reactHooks.configs['recommended-latest'],
  reactCompiler.configs.recommended,
  ...tanstackQuery.configs['flat/recommended'],
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'better-tailwindcss': betterTailwind },
    settings: {
      'better-tailwindcss': {
        entryPoint: 'app/globals.css',
      },
    },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'error',
      'better-tailwindcss/enforce-shorthand-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-restricted-classes': 'error',
      'better-tailwindcss/no-unnecessary-whitespace': 'error',
    },
  },
  {
    plugins: {
      import: importPlugin,
      local: localPlugin,
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-constant-binary-expression': 'error',
      'no-nested-ternary': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'local/no-inline-styles': 'error',
      'local/prefer-design-token-class': 'error',
      'import/no-default-export': 'error',
      'local/no-large-assets': [
        'error',
        {
          patterns: [
            {
              fileTypes: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp'],
              limitInKiloBytes: 200,
            },
            {
              fileTypes: ['.mp3', '.ogg', '.wav'],
              limitInKiloBytes: 1024,
            },
          ],
        },
      ],
    },
  },
  {
    files: NEXT_DEFAULT_EXPORT_FILES,
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', 'lib/db/client.ts', 'lib/providers/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
)

export default config
