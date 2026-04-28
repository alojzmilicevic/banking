import { and, eq, gte } from 'drizzle-orm'
import {
  accounts,
  balances,
  connections,
  db,
  instruments,
  positions,
  transactions,
} from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
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

  const conn = db.select().from(connections).where(eq(connections.id, connectionId)).get()
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const provider = getProvider(conn.providerId)

  const isInitial = mode === 'force-full' || (mode === 'auto' && !conn.initialSyncedAt)
  const lookbackDays = isInitial ? INITIAL_LOOKBACK_DAYS : INCREMENTAL_LOOKBACK_DAYS
  const until = new Date()
  const since = new Date(until.getTime() - lookbackDays * 86400_000)

  const result = await provider.sync(
    { id: conn.id, externalId: conn.externalId, rawJson: conn.rawJson },
    { since, until },
  )

  const now = Date.now()

  db.transaction((tx) => {
    // Instruments are global and shared across users — upsert by id.
    for (const i of result.instruments ?? []) {
      tx.insert(instruments)
        .values({
          id: i.id,
          type: i.type,
          name: i.name ?? null,
          ticker: i.ticker ?? null,
          currency: i.currency ?? null,
          isin: i.isin ?? null,
          providerId: i.providerId ?? null,
          providerInstrumentId: i.providerInstrumentId ?? null,
          rawJson: JSON.stringify(i.raw),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: instruments.id,
          set: {
            type: i.type,
            name: i.name ?? null,
            ticker: i.ticker ?? null,
            currency: i.currency ?? null,
            isin: i.isin ?? null,
            rawJson: JSON.stringify(i.raw),
            updatedAt: now,
          },
        })
        .run()
    }

    // Accounts: stable id (provider's uid). Upsert.
    for (const a of result.accounts) {
      tx.insert(accounts)
        .values({
          id: a.id,
          connectionId,
          kind: a.kind,
          ownership: a.ownership ?? 'sole',
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
            kind: a.kind,
            ownership: a.ownership ?? 'sole',
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

    // Balances are a snapshot — fully replace per touched account.
    const balanceAccountIds = Array.from(new Set(result.balances.map((b) => b.accountId)))
    for (const aid of balanceAccountIds) {
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

    // Positions: snapshot — replace fully per touched account.
    const positionAccountIds = Array.from(
      new Set((result.positions ?? []).map((p) => p.accountId)),
    )
    for (const aid of positionAccountIds) {
      tx.delete(positions).where(eq(positions.accountId, aid)).run()
    }
    for (const p of result.positions ?? []) {
      tx.insert(positions)
        .values({
          accountId: p.accountId,
          instrumentId: p.instrumentId,
          quantity: p.quantity,
          avgCost: p.avgCost ?? null,
          marketValue: p.marketValue ?? null,
          currency: p.currency,
          rawJson: JSON.stringify(p.raw),
          fetchedAt: now,
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
          kind: t.kind,
          amount: t.amount,
          currency: t.currency,
          instrumentId: t.instrumentId ?? null,
          quantity: t.quantity ?? null,
          status: t.status ?? null,
          description: t.description ?? null,
          counterparty: t.counterparty ?? null,
          rawJson: JSON.stringify(t.raw),
        })
        .onConflictDoUpdate({
          target: [transactions.accountId, transactions.fingerprint],
          set: {
            date: t.date,
            kind: t.kind,
            amount: t.amount,
            currency: t.currency,
            instrumentId: t.instrumentId ?? null,
            quantity: t.quantity ?? null,
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

  // Recompute today's daily wealth snapshot for this user. Cheap (DB-only).
  rebuildSnapshotsForUser(conn.userId, { onlyToday: true })

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

export async function syncAllForUser(userId: string): Promise<SyncOutcome[]> {
  const conns = db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.status, 'active')))
    .all()
  return Promise.all(conns.map((c) => syncConnection(c.id)))
}
