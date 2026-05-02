// Flat config bridging eslint-config-next (still legacy-format) onto
// ESLint 9 via FlatCompat. Drop the bridge once eslint-config-next ships
// a native flat config.
import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'lib/db/migrations/**', 'data/**'] },
  ...compat.extends('next/core-web-vitals'),
]

export default config
