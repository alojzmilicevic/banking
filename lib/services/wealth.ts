// Wealth mutations — the SINGLE entry point for any operation that
// changes the household's net worth state.
//
// Invariant: every function in this module performs the DB mutation AND
// rebuilds `daily_snapshots` (directly or via syncConnection) so the
// chart and totals stay in sync with the live balances. Routes must
// never call drizzle directly for these operations — go through the
// service. The architecture goal: forgetting to rebuild becomes
// structurally impossible because the route doesn't have access to the
// raw write.
//
// Operations that mutate wealth:
//   - disconnectConnection: removes a bank link (cascade-deletes accounts)
//   - setAccountExcluded:   toggles whether an account contributes to totals
//   - syncConnection:       refreshes data from one provider (rebuilds inside)
//   - syncAllForUser:       runs sync across every active connection
//
// If you add a new write path that touches `connections`, `accounts`,
// `balances`, `positions`, `transactions`, `account_value_history`, or
// `connection_holders`, it belongs here and MUST end with a snapshot
// rebuild. See `lib/sync/snapshots.ts:rebuildSnapshotsForUser`.

import { eq } from 'drizzle-orm'
import { accounts, connections, db } from '@/lib/db/client'
import { rebuildSnapshotsForUser } from '@/lib/sync/snapshots'

// Re-export the sync entry points so the wealth service is the only
// import path callers need to know. The implementation lives in
// lib/sync/orchestrator.ts but conceptually it's a wealth mutation.
export { syncConnection, syncAllForUser } from '@/lib/sync/orchestrator'
export type { SyncMode, SyncOutcome, SyncRunResult } from '@/lib/sync/orchestrator'

// ─── Disconnect ─────────────────────────────────────────────────────────

export interface DisconnectResult {
  removed: string
}

// Removes a connection and all of its data (accounts/balances/positions/
// transactions/account_value_history/connection_holders cascade per the
// FK rules in lib/db/schema.ts), then rebuilds the wealth chart so the
// removed accounts stop appearing in historical totals.
export function disconnectConnection(connectionId: string): DisconnectResult | null {
  const row = db.select().from(connections).where(eq(connections.id, connectionId)).get()
  if (!row) return null
  db.delete(connections).where(eq(connections.id, connectionId)).run()
  rebuildSnapshotsForUser(row.userId)
  return { removed: connectionId }
}

// ─── Account exclusion ──────────────────────────────────────────────────

export interface SetAccountExcludedResult {
  id: string
  excludedFromTotal: boolean
}

// Toggles whether an account contributes to the household total. The
// chart updates immediately because rebuild walks back through every
// daily_snapshots row using the new excluded flag.
export function setAccountExcluded(
  accountId: string,
  excluded: boolean,
): SetAccountExcludedResult | null {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get()
  if (!account) return null
  db.update(accounts)
    .set({ excludedFromTotal: excluded ? 1 : 0 })
    .where(eq(accounts.id, accountId))
    .run()
  // Look up the connection only to find userId — accounts don't carry it
  // directly (it lives on the connection).
  const conn = db.select().from(connections).where(eq(connections.id, account.connectionId)).get()
  if (conn) rebuildSnapshotsForUser(conn.userId, { daysBack: 365 })
  return { id: accountId, excludedFromTotal: excluded }
}
