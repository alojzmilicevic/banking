// Runs babel-plugin-react-compiler over the given files (or the whole app by
// default) and emits GitHub Actions warnings inline on the PR diff for each
// skip. Visibility-only: exits 0 even when there are skips. Only fails if the
// transform itself crashes (a real tooling problem).
//
// Usage:
//   pnpm compiler:check                        # whole codebase
//   pnpm compiler:check app/x.tsx lib/y.ts     # specific files (CI uses this)

import { transformFileAsync } from '@babel/core'
import { globSync } from 'node:fs'
import { relative } from 'node:path'

const cwd = process.cwd()

const EXCLUDED = [
  /__tests__\//,
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
  /node_modules\//,
]

const args = process.argv.slice(2)
const patterns = args.length > 0 ? args : ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}']

const files = globSync(patterns, {
  exclude: (path) => EXCLUDED.some((re) => re.test(path)),
})

let compiled = 0
let skipped = 0
let crashed = false

for (const file of files) {
  const rel = relative(cwd, file)
  try {
    await transformFileAsync(file, {
      filename: file,
      configFile: false,
      babelrc: false,
      presets: [
        ['@babel/preset-typescript', { isTSX: file.endsWith('.tsx'), allExtensions: true }],
      ],
      plugins: [
        [
          'babel-plugin-react-compiler',
          {
            compilationMode: 'infer',
            logger: {
              logEvent(_filename, event) {
                if (event.kind === 'CompileSuccess') {
                  compiled += 1
                  return
                }
                if (event.kind !== 'CompileError') return
                skipped += 1
                const loc = event.detail.primaryLocation?.()
                const line = loc?.start.line ?? event.fnLoc?.start.line ?? 1
                const col = (loc?.start.column ?? event.fnLoc?.start.column ?? 0) + 1
                const reason = event.detail.options?.reason ?? 'Unknown'
                console.log(
                  `::warning file=${rel},line=${line},col=${col},title=React Compiler skipped::${reason}`,
                )
              },
            },
          },
        ],
      ],
    })
  } catch (err) {
    crashed = true
    const msg = err instanceof Error ? err.message : String(err)
    console.log(
      `::error file=${rel},line=1,col=1,title=React Compiler crashed::${msg.replace(/\n/g, ' ')}`,
    )
  }
}

console.log(`React Compiler: ${compiled} compiled, ${skipped} skipped`)
process.exit(crashed ? 1 : 0)
