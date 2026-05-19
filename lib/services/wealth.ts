// Wealth mutations — the SINGLE entry point for any operation that
// changes the household's net worth state.
//
// Invariant: every function in this module performs the DB mutation
// AND, when the mutation actually changes per-day account contributions
// (sync, disconnect — anything that adds, removes, or rewrites balances /
// positions / transactions / value history / holder bucketing), rebuilds
// `account_daily_snapshots` so the chart stays in sync. The
// `excluded_from_total` toggle does NOT need a rebuild because the read
// path joins the live flag at aggregation time.
//
// Operations that mutate wealth:
//   - disconnectConnection: removes a bank link (cascade-deletes accounts)
//   - setAccountExcluded:   toggles whether an account contributes (no rebuild — read-time filter)
//   - syncConnection:       refreshes data from one provider (rebuilds inside)
//   - syncAllForUser:       runs sync across every active connection
//
// If you add a new write path that touches `connections`, `accounts`,
// `balances`, `positions`, `transactions`, `account_value_history`, or
// `connection_holders`, it belongs here and MUST end with a snapshot
// rebuild. See `lib/sync/snapshots.ts:rebuildSnapshotsForUser`.

import * as accountsRepo from '@/lib/repositories/accounts'
import * as connectionsRepo from '@/lib/repositories/connections'
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
//
// Caller MUST pass the requesting user's id; mismatches are treated as
// "not found" so a stale or tampered id can't reach across users.
export function disconnectConnection(
  connectionId: string,
  userId: string,
): DisconnectResult | null {
  const row = connectionsRepo.getById(connectionId)
  if (!row || row.userId !== userId) return null
  connectionsRepo.deleteById(connectionId)
  rebuildSnapshotsForUser(row.userId)
  return { removed: connectionId }
}

// ─── Account exclusion ──────────────────────────────────────────────────

export interface SetAccountExcludedResult {
  id: string
  excludedFromTotal: boolean
}

// Toggles whether an account contributes to the household total. The
// chart updates immediately because the read path joins
// `accounts.excluded_from_total` over the per-account daily rows in
// `account_daily_snapshots` — toggling the flag changes what the next
// read aggregates without rewriting any history.
//
// Ownership is enforced by walking account → connection.userId; mismatches
// return null so the route maps to 404.
export function setAccountExcluded(
  accountId: string,
  excluded: boolean,
  userId: string,
): SetAccountExcludedResult | null {
  const account = accountsRepo.getById(accountId)
  if (!account) return null
  // Look up the connection only to find userId — accounts don't carry it
  // directly (it lives on the connection).
  const conn = connectionsRepo.getById(account.connectionId)
  if (!conn || conn.userId !== userId) return null
  accountsRepo.setExcluded(accountId, excluded)
  return { id: accountId, excludedFromTotal: excluded }
}

// ─── Account alias ──────────────────────────────────────────────────────

export interface SetAccountAliasResult {
  id: string
  alias: string | null
}

// User-supplied display name override. Empty string clears it back to the
// provider name. No snapshot rebuild — alias is a presentation-only field
// resolved at dashboard read time.
export function setAccountAlias(
  accountId: string,
  alias: string,
  userId: string,
): SetAccountAliasResult | null {
  const account = accountsRepo.getById(accountId)
  if (!account) return null
  const conn = connectionsRepo.getById(account.connectionId)
  if (!conn || conn.userId !== userId) return null
  const next = alias.length === 0 ? null : alias
  accountsRepo.setAlias(accountId, next)
  return { id: accountId, alias: next }
}
