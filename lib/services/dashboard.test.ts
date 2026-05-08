import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb, teardownTestDb } from '../../tests/helpers/test-db'
import {
  accountValueHistory,
  accounts,
  balances,
  connectionHolders,
  connections,
  dailySnapshots,
  holders,
  positions,
  transactions,
  users,
} from '@/lib/db/schema'
import type { drizzle } from 'drizzle-orm/better-sqlite3'

let testDb: ReturnType<typeof drizzle>

beforeAll(() => {
  testDb = setupTestDb()
})

afterAll(() => {
  teardownTestDb()
})

beforeEach(() => {
  testDb.delete(dailySnapshots).run()
  testDb.delete(accountValueHistory).run()
  testDb.delete(transactions).run()
  testDb.delete(positions).run()
  testDb.delete(balances).run()
  testDb.delete(accounts).run()
  testDb.delete(connectionHolders).run()
  testDb.delete(connections).run()
  testDb.delete(holders).run()
  testDb.delete(users).run()
})

function seedHousehold(): { userId: string; alma: string; alojz: string } {
  testDb.insert(users).values({ id: 'u1', name: 'Household' }).run()
  testDb
    .insert(holders)
    .values([
      { id: 'h-alma', userId: 'u1', label: 'Alma', color: '#aaa', initials: 'AL', displayOrder: 0 },
      { id: 'h-alojz', userId: 'u1', label: 'Alojz', color: '#bbb', initials: 'AM', displayOrder: 1 },
    ])
    .run()
  return { userId: 'u1', alma: 'h-alma', alojz: 'h-alojz' }
}

function addConnection(id: string, holderIds: string[] = []): void {
  testDb
    .insert(connections)
    .values({
      id,
      userId: 'u1',
      providerId: 'enable-banking',
      externalId: `ext-${id}`,
      label: id,
      status: 'active',
    })
    .run()
  for (const holderId of holderIds) {
    testDb.insert(connectionHolders).values({ connectionId: id, holderId }).run()
  }
}

function addAccount(
  id: string,
  connectionId: string,
  amount: number,
  opts: { kind?: string; iban?: string; excluded?: boolean } = {},
): void {
  testDb
    .insert(accounts)
    .values({
      id,
      connectionId,
      kind: opts.kind ?? 'cash',
      ownership: 'sole',
      excludedFromTotal: opts.excluded ? 1 : 0,
      currency: 'SEK',
      iban: opts.iban ?? null,
    })
    .run()
  testDb
    .insert(balances)
    .values({
      accountId: id,
      balanceType: 'CLBD',
      amount,
      currency: 'SEK',
    })
    .run()
}

async function importGetDashboard() {
  const mod = await import('./dashboard')
  return mod.getDashboard
}

describe('getDashboard', () => {
  it('returns empty buckets for a user with no connections', async () => {
    seedHousehold()
    const getDashboard = await importGetDashboard()

    const out = getDashboard('u1', '1Y')

    expect(out.holders).toHaveLength(2)
    expect(out.holders.every((h) => h.total === 0)).toBe(true)
    expect(out.shared.accounts).toEqual([])
    expect(out.unassigned).toBeNull()
    expect(out.totals).toEqual({ total: 0, cash: 0, investment: 0, change: null })
  })

  it('places a single-holder connection under that holder bucket', async () => {
    const { alma } = seedHousehold()
    addConnection('c1', [alma])
    addAccount('a1', 'c1', 1000)

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    const almaBucket = out.holders.find((h) => h.id === alma)!
    expect(almaBucket.total).toBe(1000)
    expect(almaBucket.accounts).toHaveLength(1)
    expect(almaBucket.accounts[0].id).toBe('a1')
    expect(almaBucket.accounts[0].bucket).toEqual({ kind: 'holder', holderId: alma })
    expect(out.totals.total).toBe(1000)
  })

  it('routes a connection with 2+ holders to the shared bucket', async () => {
    const { alma, alojz } = seedHousehold()
    addConnection('c1', [alma, alojz])
    addAccount('a1', 'c1', 500, { kind: 'cash' })

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    expect(out.shared.accounts).toHaveLength(1)
    expect(out.shared.total).toBe(500)
    expect(out.holders.every((h) => h.total === 0)).toBe(true)
    expect(out.totals.total).toBe(500)
  })

  it('detects auto-joint via duplicate IBAN across different holder sets', async () => {
    const { alma, alojz } = seedHousehold()
    // Same IBAN, two connections, two different holders → auto-joint.
    addConnection('c-alma', [alma])
    addAccount('a-alma', 'c-alma', 100, { iban: 'SE-SHARED' })
    addConnection('c-alojz', [alojz])
    addAccount('a-alojz', 'c-alojz', 100, { iban: 'SE-SHARED' })

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    expect(out.shared.accounts).toHaveLength(2)
    // Only the canonical (earliest-created) contributes to totals; the
    // dupe has possibleDuplicateOf set so the FE can hide it.
    const dupes = out.shared.accounts.filter((a) => a.possibleDuplicateOf !== null)
    expect(dupes).toHaveLength(1)
    expect(out.totals.total).toBe(100)
    expect(out.shared.total).toBe(100)
  })

  it('puts holder-less connections in the unassigned bucket', async () => {
    seedHousehold()
    addConnection('c1', [])
    addAccount('a1', 'c1', 250)

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    expect(out.unassigned).not.toBeNull()
    expect(out.unassigned!.accounts).toHaveLength(1)
    expect(out.unassigned!.total).toBe(250)
    expect(out.holders.every((h) => h.total === 0)).toBe(true)
  })

  it('separates cash and investment in totals', async () => {
    const { alma } = seedHousehold()
    addConnection('c1', [alma])
    addAccount('a-cash', 'c1', 1000, { kind: 'cash' })
    addAccount('a-inv', 'c1', 5000, { kind: 'investment' })

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    expect(out.totals.total).toBe(6000)
    expect(out.totals.cash).toBe(1000)
    expect(out.totals.investment).toBe(5000)
  })

  it('excludes accounts marked excludedFromTotal from the household sum', async () => {
    const { alma } = seedHousehold()
    addConnection('c1', [alma])
    addAccount('a-included', 'c1', 1000)
    addAccount('a-excluded', 'c1', 999_999, { excluded: true })

    const getDashboard = await importGetDashboard()
    const out = getDashboard('u1', '1Y')

    // Excluded account is still in the response (FE renders it in "hidden")
    // but doesn't contribute to totals.
    const almaBucket = out.holders.find((h) => h.id === alma)!
    expect(almaBucket.accounts).toHaveLength(2)
    expect(almaBucket.total).toBe(1000)
    expect(out.totals.total).toBe(1000)
  })
})
