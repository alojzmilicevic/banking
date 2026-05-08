import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../../tests/helpers/test-db'
import {
  accountValueHistory,
  accounts,
  balances,
  connections,
  instruments,
  positions,
  transactions,
  users,
} from '@/lib/db/schema'
import type { SyncResult } from '@/lib/providers/types'
import { eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'

let testDb: ReturnType<typeof drizzle>

beforeAll(() => {
  testDb = setupTestDb()
})

afterAll(() => {
  teardownTestDb()
})

beforeEach(() => {
  // Tables ordered to respect FK dependencies.
  testDb.delete(accountValueHistory).run()
  testDb.delete(transactions).run()
  testDb.delete(positions).run()
  testDb.delete(balances).run()
  testDb.delete(accounts).run()
  testDb.delete(instruments).run()
  testDb.delete(connections).run()
  testDb.delete(users).run()
})

function seedConnection() {
  testDb.insert(users).values({ id: 'u1', name: 'Household' }).run()
  testDb
    .insert(connections)
    .values({
      id: 'c1',
      userId: 'u1',
      providerId: 'enable-banking',
      externalId: 'ext1',
      label: 'Bank',
      status: 'active',
    })
    .run()
}

function buildSyncResult(over: Partial<SyncResult> = {}): SyncResult {
  return {
    accounts: [
      {
        id: 'acc1',
        kind: 'cash',
        ownership: 'sole',
        name: 'Checking',
        details: null,
        product: null,
        accountType: 'CACC',
        currency: 'SEK',
        iban: 'SE111',
        bban: null,
        bic: null,
      },
    ],
    balances: [
      {
        accountId: 'acc1',
        balanceType: 'CLBD',
        amount: 1234.56,
        currency: 'SEK',
        referenceDate: '2026-05-08',
      },
    ],
    transactions: [
      {
        accountId: 'acc1',
        fingerprint: 'fp1',
        date: '2026-05-07',
        kind: 'cash_in',
        amount: 500,
        currency: 'SEK',
        instrumentId: null,
        quantity: null,
        status: 'BOOK',
        description: 'Payday',
        counterparty: null,
      },
    ],
    syncWindow: { from: '2026-04-08', to: '2026-05-08' },
    ...over,
  }
}

// We need to import the macro lazily so the `db` proxy in lib/db/client
// resolves AFTER setupTestDb has set globalThis.__bankingDb. Top-level
// imports work too because the proxy doesn't trigger getInstance until
// a property is read on it, but importing inside the test makes the
// ordering guarantee explicit.
async function importPersist() {
  const mod = await import('./sync-results')
  return mod.persistSyncResult
}

describe('persistSyncResult', () => {
  it('upserts accounts, balances, transactions in one transaction', async () => {
    seedConnection()
    const persist = await importPersist()
    const result = buildSyncResult()

    persist({ connectionId: 'c1', isInitial: true, result, now: 1_700_000_000_000 })

    expect(testDb.select().from(accounts).all()).toHaveLength(1)
    expect(testDb.select().from(balances).all()).toMatchObject([
      { accountId: 'acc1', balanceType: 'CLBD', amount: 1234.56, currency: 'SEK' },
    ])
    expect(testDb.select().from(transactions).all()).toMatchObject([
      { accountId: 'acc1', fingerprint: 'fp1', amount: 500, kind: 'cash_in' },
    ])
  })

  it('replaces balances per touched account (snapshot semantics)', async () => {
    seedConnection()
    const persist = await importPersist()

    persist({
      connectionId: 'c1',
      isInitial: true,
      result: buildSyncResult(),
      now: 1_700_000_000_000,
    })

    persist({
      connectionId: 'c1',
      isInitial: false,
      result: buildSyncResult({
        balances: [
          {
            accountId: 'acc1',
            balanceType: 'CLBD',
            amount: 9999,
            currency: 'SEK',
            referenceDate: '2026-05-08',
          },
        ],
      }),
      now: 1_700_000_001_000,
    })

    const rows = testDb.select().from(balances).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(9999)
  })

  it('preserves transactions older than the sync window', async () => {
    seedConnection()
    const persist = await importPersist()

    // First sync: window covers 2026-04-08 onward, but the result
    // includes a tx dated before. Use the macro to seed both.
    persist({
      connectionId: 'c1',
      isInitial: true,
      result: buildSyncResult({
        transactions: [
          {
            accountId: 'acc1',
            fingerprint: 'old',
            date: '2026-03-01',
            kind: 'cash_in',
            amount: 100,
            currency: 'SEK',
            instrumentId: null,
            quantity: null,
            status: 'BOOK',
            description: null,
            counterparty: null,
          },
        ],
        syncWindow: { from: '2026-02-01', to: '2026-05-08' },
      }),
      now: 1_700_000_000_000,
    })

    // Second sync with a tighter window. The 2026-03-01 tx is OUTSIDE
    // the new window (window starts 2026-04-08) → must survive.
    persist({
      connectionId: 'c1',
      isInitial: false,
      result: buildSyncResult({
        transactions: [
          {
            accountId: 'acc1',
            fingerprint: 'fp1',
            date: '2026-05-07',
            kind: 'cash_in',
            amount: 500,
            currency: 'SEK',
            instrumentId: null,
            quantity: null,
            status: 'BOOK',
            description: 'Payday',
            counterparty: null,
          },
        ],
        syncWindow: { from: '2026-04-08', to: '2026-05-08' },
      }),
      now: 1_700_000_001_000,
    })

    const fps = testDb
      .select({ fp: transactions.fingerprint })
      .from(transactions)
      .all()
      .map((r) => r.fp)
      .sort()
    expect(fps).toEqual(['fp1', 'old'])
  })

  it('updates lastSyncedAt and clears lastSyncError', async () => {
    seedConnection()
    testDb
      .update(connections)
      .set({ lastSyncError: '[stale] previous failure' })
      .where(eq(connections.id, 'c1'))
      .run()

    const persist = await importPersist()
    persist({
      connectionId: 'c1',
      isInitial: true,
      result: buildSyncResult(),
      now: 1_700_000_000_000,
    })

    const conn = testDb.select().from(connections).where(eq(connections.id, 'c1')).get()!
    expect(conn.lastSyncedAt).toBe(1_700_000_000_000)
    expect(conn.lastSyncError).toBeNull()
    expect(conn.initialSyncedAt).toBe(1_700_000_000_000)
  })

  it('only sets initialSyncedAt when isInitial is true', async () => {
    seedConnection()
    const persist = await importPersist()

    persist({
      connectionId: 'c1',
      isInitial: false,
      result: buildSyncResult(),
      now: 1_700_000_000_000,
    })

    const conn = testDb.select().from(connections).where(eq(connections.id, 'c1')).get()!
    expect(conn.initialSyncedAt).toBeNull()
    expect(conn.lastSyncedAt).toBe(1_700_000_000_000)
  })

  it('upserts instruments and positions, replacing positions per account', async () => {
    seedConnection()
    const persist = await importPersist()

    persist({
      connectionId: 'c1',
      isInitial: true,
      result: buildSyncResult({
        instruments: [
          {
            id: 'isin1',
            type: 'STOCK',
            name: 'Acme',
            ticker: 'ACME',
            currency: 'SEK',
            isin: 'isin1',
            providerId: null,
            providerInstrumentId: null,
          },
        ],
        positions: [
          {
            accountId: 'acc1',
            instrumentId: 'isin1',
            quantity: 10,
            avgCost: 100,
            marketValue: 1500,
            currency: 'SEK',
          },
        ],
      }),
      now: 1_700_000_000_000,
    })

    expect(testDb.select().from(instruments).all()).toHaveLength(1)
    expect(testDb.select().from(positions).all()).toMatchObject([
      { accountId: 'acc1', instrumentId: 'isin1', quantity: 10, marketValue: 1500 },
    ])

    // Second sync replaces the position fully (tests the per-account delete-then-insert).
    persist({
      connectionId: 'c1',
      isInitial: false,
      result: buildSyncResult({
        instruments: [
          {
            id: 'isin1',
            type: 'STOCK',
            name: 'Acme',
            ticker: 'ACME',
            currency: 'SEK',
            isin: 'isin1',
            providerId: null,
            providerInstrumentId: null,
          },
        ],
        positions: [
          {
            accountId: 'acc1',
            instrumentId: 'isin1',
            quantity: 20,
            avgCost: 100,
            marketValue: 3000,
            currency: 'SEK',
          },
        ],
      }),
      now: 1_700_000_001_000,
    })

    const rows = testDb.select().from(positions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(20)
    expect(rows[0].marketValue).toBe(3000)
  })
})
