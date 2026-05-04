// Flat config wired directly against the Next + React plugins. Bypasses
// eslint-config-next's @rushstack/eslint-patch shim, which doesn't recognise
// ESLint 9 and breaks `pnpm lint`.
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactCompiler from 'eslint-plugin-react-compiler'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'lib/db/migrations/**', 'data/**'] },
  nextPlugin.flatConfig.coreWebVitals,
  reactHooks.configs['recommended-latest'],
  reactCompiler.configs.recommended,
]

export default config
