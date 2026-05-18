// Accounts repository — drizzle queries only.

import { eq, inArray } from 'drizzle-orm'
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

// Pass null to clear the alias and fall back to the provider name.
export function setAlias(id: string, alias: string | null, executor: Executor = db): void {
  executor
    .update(accounts)
    .set({ alias, updatedAt: Date.now() })
    .where(eq(accounts.id, id))
    .run()
}

// Joined view used by the snapshot rebuilder. The rebuilder loads ALL
// accounts (including excluded ones) and persists per-account daily rows
// — the `excluded_from_total` filter is applied at read time so toggling
// the flag doesn't require recomputing 365 days of history.
export interface UserAccountRow {
  id: string
  kind: string | null
  currency: string | null
  connectionId: string
  iban: string | null
  bban: string | null
  createdAt: number
  excludedFromTotal: number
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

// Joined view for the snapshot rebuilder. Returns every account
// (excluded or not) — exclusion is applied at read time over the
// per-account daily rows.
export function listForUser(userId: string, executor: Executor = db): UserAccountRow[] {
  return executor
    .select({
      id: accounts.id,
      kind: accounts.kind,
      currency: accounts.currency,
      connectionId: accounts.connectionId,
      iban: accounts.iban,
      bban: accounts.bban,
      createdAt: accounts.createdAt,
      excludedFromTotal: accounts.excludedFromTotal,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(eq(connections.userId, userId))
    .all()
}

