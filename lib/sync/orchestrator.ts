import * as connectionsRepo from '@/lib/repositories/connections'
import { persistSyncResult } from '@/lib/repositories/sync-results'
import { getProvider } from '@/lib/providers/registry'
import { classifyError } from './errors'
import { loadCredentials, saveCredentials } from './credentials'
import { rebuildSnapshotsForUser } from './snapshots'

const INITIAL_LOOKBACK_DAYS = 365
const INCREMENTAL_LOOKBACK_DAYS = 4

export type SyncMode = 'auto' | 'force-full' | 'force-incremental'

export interface SyncOutcome {
  connectionId: string
  providerId: string
  mode: 'initial' | 'incremental'
  windowFrom: string
  windowTo: string
  accounts: number
  balances: number
  transactions: number
  instruments: number
  positions: number
  durationMs: number
}

export async function syncConnection(
  connectionId: string,
  opts: { mode?: SyncMode } = {},
): Promise<SyncOutcome> {
  const t0 = Date.now()
  const mode = opts.mode ?? 'auto'

  const conn = connectionsRepo.getById(connectionId)
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const provider = getProvider(conn.providerId)

  const isInitial = mode === 'force-full' || (mode === 'auto' && !conn.initialSyncedAt)
  const lookbackDays = isInitial ? INITIAL_LOOKBACK_DAYS : INCREMENTAL_LOOKBACK_DAYS
  const until = new Date()
  const since = new Date(until.getTime() - lookbackDays * 86400_000)

  // Decrypt any stored credentials (cookies, future password+TOTP) just
  // long enough to hand them to the provider's sync. Plaintext never
  // touches the orchestrator's persistence path.
  const credentials = loadCredentials(conn.id) ?? undefined

  let result
  try {
    result = await provider.sync(
      { id: conn.id, externalId: conn.externalId, rawJson: conn.rawJson, credentials },
      { since, until },
    )
  } catch (e) {
    // Classify so the persisted error carries an actionable category prefix
    // and the thrown error becomes a SyncError (callers can match on
    // .category instead of regex-ing the message).
    const classified = classifyError(e)
    connectionsRepo.update(connectionId, {
      lastSyncError: `[${classified.category}] ${classified.message}`,
    })
    throw classified
  }

  const now = Date.now()

  persistSyncResult({ connectionId, isInitial, result, now })

  // Persist any provider-rotated credentials. Done outside the data
  // transaction so a credentials write isn't strictly tied to the data
  // sync — we'd rather keep the data sync atomic and treat credential
  // refresh as a best-effort follow-up.
  if (result.refreshedCredentials) {
    saveCredentials(conn.id, result.refreshedCredentials)
  }

  // Recompute the full last-365-day wealth snapshot series. DB-only and
  // fast — uses Avanza account_value_history for investments + EB
  // transaction walkback for cash, joined per day.
  rebuildSnapshotsForUser(conn.userId, { daysBack: 365 })

  return {
    connectionId,
    providerId: conn.providerId,
    mode: isInitial ? 'initial' : 'incremental',
    windowFrom: result.syncWindow.from,
    windowTo: result.syncWindow.to,
    accounts: result.accounts.length,
    balances: result.balances.length,
    transactions: result.transactions.length,
    instruments: result.instruments?.length ?? 0,
    positions: result.positions?.length ?? 0,
    durationMs: Date.now() - t0,
  }
}

export interface SyncRunResult {
  connectionId: string
  outcome?: SyncOutcome
  error?: string
}

export async function syncAllForUser(userId: string): Promise<SyncRunResult[]> {
  const conns = connectionsRepo.listActiveForUser(userId)
  const settled = await Promise.allSettled(conns.map((c) => syncConnection(c.id)))
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { connectionId: conns[i].id, outcome: r.value }
    }
    return {
      connectionId: conns[i].id,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  })
}
