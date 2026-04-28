import { and, eq, gte } from 'drizzle-orm'
import { accounts, balances, connections, db, transactions } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'

const INITIAL_LOOKBACK_DAYS = 365
const INCREMENTAL_LOOKBACK_DAYS = 4

export type SyncMode = 'auto' | 'force-full' | 'force-incremental'

export interface SyncOutcome {
  connectionId: string
  mode: 'initial' | 'incremental'
  windowFrom: string
  windowTo: string
  accounts: number
  balances: number
  transactions: number
  durationMs: number
}

export async function syncConnection(
  connectionId: string,
  opts: { mode?: SyncMode } = {},
): Promise<SyncOutcome> {
  const t0 = Date.now()
  const mode = opts.mode ?? 'auto'

  const conn = db.select().from(connections).where(eq(connections.id, connectionId)).get()
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const provider = getProvider(conn.providerId)

  // Decide window: full backfill on first sync (or forced); 14-day window
  // otherwise. Frozen historical data is never refetched.
  const isInitial = mode === 'force-full' || (mode === 'auto' && !conn.initialSyncedAt)
  const lookbackDays = isInitial ? INITIAL_LOOKBACK_DAYS : INCREMENTAL_LOOKBACK_DAYS
  const until = new Date()
  const since = new Date(until.getTime() - lookbackDays * 86400_000)

  const result = await provider.sync(
    { externalId: conn.externalId, rawJson: conn.rawJson },
    { since, until },
  )

  const now = Date.now()

  // Single transaction: keeps DB consistent even if a partial write fails.
  db.transaction((tx) => {
    // Upsert accounts. Account uids are stable so this is safe across syncs.
    for (const a of result.accounts) {
      tx.insert(accounts)
        .values({
          id: a.id,
          connectionId,
          name: a.name ?? null,
          details: a.details ?? null,
          product: a.product ?? null,
          accountType: a.accountType ?? null,
          currency: a.currency ?? null,
          iban: a.iban ?? null,
          bban: a.bban ?? null,
          bic: a.bic ?? null,
          rawJson: JSON.stringify(a.raw),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accounts.id,
          set: {
            name: a.name ?? null,
            details: a.details ?? null,
            product: a.product ?? null,
            accountType: a.accountType ?? null,
            currency: a.currency ?? null,
            iban: a.iban ?? null,
            bban: a.bban ?? null,
            bic: a.bic ?? null,
            rawJson: JSON.stringify(a.raw),
            updatedAt: now,
          },
        })
        .run()
    }

    // Balances are a snapshot — fully replace per account.
    const accountIds = Array.from(new Set(result.balances.map((b) => b.accountId)))
    for (const aid of accountIds) {
      tx.delete(balances).where(eq(balances.accountId, aid)).run()
    }
    for (const b of result.balances) {
      tx.insert(balances)
        .values({
          accountId: b.accountId,
          balanceType: b.balanceType,
          amount: b.amount,
          currency: b.currency,
          referenceDate: b.referenceDate ?? null,
          rawJson: JSON.stringify(b.raw),
          fetchedAt: now,
        })
        // EB occasionally returns multiple snapshots of the same balance_type
        // (e.g. closingBooked at different reference dates). Last write wins.
        .onConflictDoUpdate({
          target: [balances.accountId, balances.balanceType],
          set: {
            amount: b.amount,
            currency: b.currency,
            referenceDate: b.referenceDate ?? null,
            rawJson: JSON.stringify(b.raw),
            fetchedAt: now,
          },
        })
        .run()
    }

    // Transactions: clear the sync window per touched account, then re-insert.
    // Older rows are immutable and never deleted/refetched.
    const txAccountIds = Array.from(new Set(result.transactions.map((t) => t.accountId)))
    for (const aid of txAccountIds) {
      tx.delete(transactions)
        .where(and(eq(transactions.accountId, aid), gte(transactions.date, result.syncWindow.from)))
        .run()
    }
    for (const t of result.transactions) {
      tx.insert(transactions)
        .values({
          accountId: t.accountId,
          fingerprint: t.fingerprint,
          date: t.date,
          amount: t.amount,
          currency: t.currency,
          status: t.status ?? null,
          description: t.description ?? null,
          counterparty: t.counterparty ?? null,
          rawJson: JSON.stringify(t.raw),
        })
        .onConflictDoUpdate({
          target: [transactions.accountId, transactions.fingerprint],
          set: {
            date: t.date,
            amount: t.amount,
            currency: t.currency,
            status: t.status ?? null,
            description: t.description ?? null,
            counterparty: t.counterparty ?? null,
            rawJson: JSON.stringify(t.raw),
          },
        })
        .run()
    }

    tx.update(connections)
      .set({
        lastSyncedAt: now,
        ...(isInitial ? { initialSyncedAt: now } : {}),
      })
      .where(eq(connections.id, connectionId))
      .run()
  })

  return {
    connectionId,
    mode: isInitial ? 'initial' : 'incremental',
    windowFrom: result.syncWindow.from,
    windowTo: result.syncWindow.to,
    accounts: result.accounts.length,
    balances: result.balances.length,
    transactions: result.transactions.length,
    durationMs: Date.now() - t0,
  }
}

export async function syncAllForUser(userId: string): Promise<SyncOutcome[]> {
  const conns = db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.status, 'active')))
    .all()
  return Promise.all(conns.map((c) => syncConnection(c.id)))
}
