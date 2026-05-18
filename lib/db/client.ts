import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import fs from 'node:fs'
import path from 'node:path'
import * as schema from './schema'
import { backfillAccountDailySnapshotsIfEmpty } from '@/lib/sync/backfill-account-daily-snapshots'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'banking.db')
const MIGRATIONS_FOLDER = path.join(process.cwd(), 'lib', 'db', 'migrations')

type Drizzle = ReturnType<typeof drizzle<typeof schema>>

declare global {
  var __bankingDb: Drizzle | undefined
}

function createDb(): Drizzle {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const sqlite = new Database(DB_FILE)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')
  const instance = drizzle(sqlite, { schema })
  migrate(instance, { migrationsFolder: MIGRATIONS_FOLDER })
  return instance
}

let _db: Drizzle | null = null
let _backfillDone = false
function getInstance(): Drizzle {
  if (_db) return _db
  if (globalThis.__bankingDb) {
    _db = globalThis.__bankingDb
    return _db
  }
  _db = createDb()
  if (process.env.NODE_ENV !== 'production') globalThis.__bankingDb = _db
  // Backfill must run AFTER `_db` is assigned: it uses the `db` proxy
  // (via the snapshot rebuild's repos), and calling that proxy before
  // `_db` is set would recursively re-enter `getInstance` and re-run
  // `createDb` indefinitely. Keep a flag so we only attempt this once
  // per process.
  if (!_backfillDone) {
    _backfillDone = true
    try {
      const backfilled = backfillAccountDailySnapshotsIfEmpty()
      if (backfilled.users > 0) {
        console.log(
          `[db] Backfilled account_daily_snapshots for ${backfilled.users} user(s), ${backfilled.rows} rows`,
        )
      }
    } catch (err) {
      console.error('[db] account_daily_snapshots backfill failed', err)
    }
  }
  return _db
}

// Proxy: feels like a Drizzle instance but defers `createDb` (and the DB
// file open + migrations) until the first time it's actually used. This is
// what keeps `next build` from racing to open the SQLite file when it
// evaluates every route module during "Collecting page data".
export const db = new Proxy({} as Drizzle, {
  get(_t, prop) {
    const inst = getInstance() as unknown as Record<string | symbol, unknown>
    const value = inst[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(inst)
      : value
  },
})

// Repositories accept an optional Executor so a service can run several
// reads inside a single `db.transaction((tx) => …)` and observe a
// consistent snapshot. The `tx` argument is a SQLiteTransaction (subset of
// the full Drizzle handle), so the alias accepts either.
type Tx = Parameters<Parameters<Drizzle['transaction']>[0]>[0]
export type Executor = Drizzle | Tx

export { schema }
export * from './schema'
