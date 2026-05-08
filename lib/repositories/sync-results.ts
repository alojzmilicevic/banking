// Persists a provider sync's full result set in a single transaction.
//
// Cross-table macro: instruments + accounts + balances + positions +
// transactions + accountValueHistory + the connection's lastSyncedAt /
// initialSyncedAt / lastSyncError / validUntil bookkeeping. Atomic so a
// crash mid-write doesn't leave the household in a half-synced state.

import { and, eq, gte } from 'drizzle-orm'
import {
  accountValueHistory,
  accounts,
  balances,
  connections,
  db,
  instruments,
  positions,
  transactions,
} from '@/lib/db/client'
import type { SyncResult } from '@/lib/providers/types'

export interface PersistSyncResultInput {
  connectionId: string
  isInitial: boolean
  result: SyncResult
  now: number
}

export function persistSyncResult({
  connectionId,
  isInitial,
  result,
  now,
}: PersistSyncResultInput): void {
  db.transaction((tx) => {
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
            updatedAt: now,
          },
        })
        .run()
    }

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
          fetchedAt: now,
        })
        .onConflictDoUpdate({
          target: [balances.accountId, balances.balanceType],
          set: {
            amount: b.amount,
            currency: b.currency,
            referenceDate: b.referenceDate ?? null,
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
          },
        })
        .run()
    }

    // Per-account daily value history (Avanza chart series).
    // UPSERT only — older rows are immutable (a stock's value on March 1
    // doesn't change retroactively), so we never delete.
    for (const v of result.dailyValues ?? []) {
      const growth = v.growth ?? null
      tx.insert(accountValueHistory)
        .values({
          accountId: v.accountId,
          date: v.date,
          value: v.value,
          growth,
          currency: v.currency,
          fetchedAt: now,
        })
        .onConflictDoUpdate({
          target: [accountValueHistory.accountId, accountValueHistory.date],
          set: { value: v.value, growth, currency: v.currency, fetchedAt: now },
        })
        .run()
    }

    tx.update(connections)
      .set({
        lastSyncedAt: now,
        lastSyncError: null,
        ...(isInitial ? { initialSyncedAt: now } : {}),
        ...(result.connectionValidUntil ? { validUntil: result.connectionValidUntil } : {}),
      })
      .where(eq(connections.id, connectionId))
      .run()
  })
}
