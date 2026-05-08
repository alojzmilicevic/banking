import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync, unlinkSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf-8',
}).trim()
const name = basename(root)

// Main worktree is the first block of `git worktree list --porcelain`.
const wts = execFileSync('git', ['worktree', 'list', '--porcelain'], {
  encoding: 'utf-8',
})
const mainRoot = wts
  .split('\n\n')[0]
  .split('\n')
  .find(l => l.startsWith('worktree '))
  ?.slice('worktree '.length)
  .trim()
const isMain = mainRoot === root

// First run in a worktree has no data/banking.db → seed it from the main
// checkout via SQLite's online backup (transactionally consistent, safe even
// if main is currently running). Skipped on subsequent runs so worktree-local
// changes survive. To re-seed: rm -rf data && pnpm dev.
const localDb = join(root, 'data', 'banking.db')
if (!existsSync(localDb) && !isMain && mainRoot) {
  const srcDb = join(mainRoot, 'data', 'banking.db')
  if (existsSync(srcDb)) {
    mkdirSync(join(root, 'data'), { recursive: true })
    const src = new Database(srcDb, { readonly: true })
    await src.backup(localDb)
    src.close()
    console.log(`[dev] seeded data/banking.db from ${mainRoot}`)
  }
}

// Main checkout always gets 3000. Worktrees hash to 3001..3999 — stable across
// runs (same worktree name → same port) so browser tabs/bookmarks survive.
function portFor() {
  if (isMain) return 3000
  const h = createHash('sha1').update(name).digest()
  return 3001 + (h.readUInt32BE(0) % 999)
}

const port = portFor()
const url = `https://localhost:${port}`
const urlFile = join(root, '.dev-url')
const pidFile = join(root, '.dev-pid')

if (process.argv.includes('--fresh')) {
  rmSync(join(root, '.next'), { recursive: true, force: true })
}
writeFileSync(urlFile, url + '\n')

console.log(`[dev] worktree=${name} port=${port}`)
console.log(`[dev] ${url}`)

const child = spawn('next', ['dev', '--turbopack', '--experimental-https', '-p', String(port)], {
  stdio: 'inherit',
  env: { ...process.env, ...(isMain ? {} : { WORKTREE_NAME: name }) },
})
// Sidecar PID lets /open-app detect SIGKILL'd runs that bypass cleanup below.
writeFileSync(pidFile, String(child.pid) + '\n')

const cleanup = () => {
  try { unlinkSync(urlFile) } catch {}
  try { unlinkSync(pidFile) } catch {}
  if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
}
process.on('exit', cleanup)
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.on('uncaughtException', err => {
  console.error(err)
  cleanup()
  process.exit(1)
})

child.on('exit', code => process.exit(code ?? 1))
