// Hijacks the lazy `db` proxy in lib/db/client.ts by stuffing an
// in-memory drizzle handle into globalThis BEFORE the proxy resolves.
// Lets integration tests exercise repos and services against a real
// sqlite (with the project's actual migrations applied) without
// touching data/banking.db.

import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/lib/db/schema'

type Drizzle = ReturnType<typeof drizzle<typeof schema>>

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../lib/db/migrations')

declare global {
  // Mirrored from lib/db/client.ts so TypeScript accepts the assignment.
  var __bankingDb: Drizzle | undefined
}

// Returns a fresh in-memory drizzle instance with all migrations applied
// and registers it as the global the `db` proxy reads from. Call once
// per test file (or per test) before exercising any repo/service.
export function setupTestDb(): Drizzle {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const instance = drizzle(sqlite, { schema })
  migrate(instance, { migrationsFolder: MIGRATIONS_FOLDER })
  globalThis.__bankingDb = instance
  return instance
}

// Detach the test DB so a later test file in the same worker doesn't
// inherit a closed handle. Pair with afterAll.
export function teardownTestDb(): void {
  globalThis.__bankingDb = undefined
}
