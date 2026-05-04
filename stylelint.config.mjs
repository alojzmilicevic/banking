import preferDesignToken from './stylelint-plugins/prefer-design-token.mjs'

export default {
  extends: ['stylelint-config-standard'],
  plugins: [preferDesignToken],
  rules: {
    // Tailwind v4 directives (`@theme`, `@apply`, `@layer`, etc.) are not
    // standard CSS — silence the warnings.
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['theme', 'apply', 'layer', 'config', 'tailwind', 'screen', 'variants', 'utility'],
      },
    ],
    // Inside `@theme` we redeclare lots of tokens by design.
    'declaration-block-no-duplicate-custom-properties': null,
    // OKLCH + double-dashed Tailwind modifier names aren't lowercase by spec
    // but are legitimate.
    'custom-property-pattern': null,

    'banking/prefer-design-token': [
      [
        {
          files: ['app/globals.css'],
          rules: [
            { prefixes: ['--color-'] },
            { prefixes: ['--text-'], properties: ['font-size'] },
            { prefixes: ['--radius'], properties: ['border-radius'] },
            { prefixes: ['--shadow-'], properties: ['box-shadow'] },
          ],
        },
      ],
    ],
  },
  ignoreFiles: [
    '.next/**',
    '.worktrees/**',
    'node_modules/**',
    'data/**',
    // The tokens themselves — this file IS the source of truth.
    'app/globals.css',
  ],
}
