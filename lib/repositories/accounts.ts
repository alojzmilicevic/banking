// Accounts repository — drizzle queries only.

import { and, eq, inArray, ne } from 'drizzle-orm'
import { accounts, connections, db, type Executor } from '@/lib/db/client'
import type { Account } from '@/lib/db/schema'

export function listByConnectionIds(
  connectionIds: string[],
  executor: Executor = db,
): Account[] {
  if (connectionIds.length === 0) return []
  return executor
    .select()
    .from(accounts)
    .where(inArray(accounts.connectionId, connectionIds))
    .all()
}

export function getById(id: string, executor: Executor = db): Account | null {
  return executor.select().from(accounts).where(eq(accounts.id, id)).get() ?? null
}

export function setExcluded(id: string, excluded: boolean, executor: Executor = db): void {
  executor
    .update(accounts)
    .set({ excludedFromTotal: excluded ? 1 : 0 })
    .where(eq(accounts.id, id))
    .run()
}

// Joined view used by the snapshot rebuilder. Only the columns the
// rebuilder actually reads, with `excluded_from_total = 0` filtered in
// SQL via the index instead of a JS .filter.
export interface UserAccountRow {
  id: string
  kind: string | null
  currency: string | null
  connectionId: string
  iban: string | null
  bban: string | null
  createdAt: number
}

// All of a user's accounts joined with their connections — used by the
// sparkline builder, which (unlike the snapshot rebuilder) wants
// excluded accounts too so the dashboard tile can still render their
// values, just with the row marked as not contributing to totals.
export function listAllForUser(
  userId: string,
  executor: Executor = db,
): { id: string; kind: string | null }[] {
  return executor
    .select({ id: accounts.id, kind: accounts.kind })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(eq(connections.userId, userId))
    .all()
}

export function listIncludedForUser(
  userId: string,
  executor: Executor = db,
): UserAccountRow[] {
  return executor
    .select({
      id: accounts.id,
      kind: accounts.kind,
      currency: accounts.currency,
      connectionId: accounts.connectionId,
      iban: accounts.iban,
      bban: accounts.bban,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(and(eq(connections.userId, userId), ne(accounts.excludedFromTotal, 1)))
    .all()
}
