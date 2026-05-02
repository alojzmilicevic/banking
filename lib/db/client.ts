import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import fs from 'node:fs'
import path from 'node:path'
import * as schema from './schema'
import { importLegacyIfPresent } from '@/lib/sync/import-legacy'

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

  const result = importLegacyIfPresent(instance)
  if (result.imported) {
    console.log(
      `[db] Imported legacy state.json: user=${result.userId} connections=${result.connections} accounts=${result.accounts}`,
    )
  }
  return instance
}

let _db: Drizzle | null = null
function getInstance(): Drizzle {
  if (_db) return _db
  if (globalThis.__bankingDb) {
    _db = globalThis.__bankingDb
    return _db
  }
  _db = createDb()
  if (process.env.NODE_ENV !== 'production') globalThis.__bankingDb = _db
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
    return typeof value === 'function' ? (value as Function).bind(inst) : value
  },
})

export { schema }
export * from './schema'
