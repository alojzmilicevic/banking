// Daily wealth snapshots. Computed after each sync. Captures cash + market
// value of holdings at "right now" so the chart can show real history of
// market drift even on no-transaction days.

import { eq, sql } from 'drizzle-orm'
import {
  accounts,
  balances,
  connections,
  dailySnapshots,
  db,
  positions,
} from '@/lib/db/client'

const BASE_CURRENCY = 'SEK'

// Order from "most authoritative current snapshot" → fallback. Berlin Group
// codes (CLBD/ITBD/...) and EB long-form (closingBooked/...) both covered.
// Avanza-specific types appear last.
const BALANCE_PREFERENCE = [
  'closingBooked',
  'CLBD',
  'interimBooked',
  'ITBD',
  'expected',
  'XPCD',
  'interimAvailable',
  'ITAV',
  'forwardAvailable',
  'FWAV',
  'openingBooked',
  'OPBD',
  'cash', // Avanza: cash component of an investment account
  'totalBalance', // Avanza: cash + securities (already includes positions)
  'ownCapital',
]

interface AccountTotals {
  accountId: string
  kind: string | null
  // Cash component only.
  cash: number
  // Market value of holdings on this account.
  investments: number
  currency: string
  // True if this account's "balance" already includes investments (e.g.
  // Avanza's totalBalance) — in that case `cash` already covers everything
  // and we should NOT add `investments` on top.
  balanceIncludesInvestments: boolean
}

function pickBalance(
  rows: { balanceType: string; amount: number; currency: string }[],
): { balance: { balanceType: string; amount: number; currency: string }; includesInvestments: boolean } | null {
  if (rows.length === 0) return null
  for (const t of BALANCE_PREFERENCE) {
    const m = rows.find((r) => r.balanceType === t)
    if (m) {
      return {
        balance: m,
        includesInvestments: t === 'totalBalance' || t === 'ownCapital',
      }
    }
  }
  return { balance: rows[0], includesInvestments: false }
}

export function computeAccountTotals(userId: string): AccountTotals[] {
  // All accounts belonging to this user via their connections.
  const userConns = db.select().from(connections).where(eq(connections.userId, userId)).all()
  const connIds = new Set(userConns.map((c) => c.id))

  const userAccounts = db
    .select()
    .from(accounts)
    .all()
    .filter((a) => connIds.has(a.connectionId))

  const out: AccountTotals[] = []

  for (const a of userAccounts) {
    const accBalances = db.select().from(balances).where(eq(balances.accountId, a.id)).all()
    const picked = pickBalance(accBalances)
    const cash = picked?.balance.amount ?? 0
    const currency = picked?.balance.currency ?? a.currency ?? BASE_CURRENCY

    const accPositions = db.select().from(positions).where(eq(positions.accountId, a.id)).all()
    const investments = accPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0)

    out.push({
      accountId: a.id,
      kind: a.kind,
      cash,
      investments,
      currency,
      balanceIncludesInvestments: picked?.includesInvestments ?? false,
    })
  }

  return out
}

export interface SnapshotResult {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  baseCurrency: string
  currencyMismatches: string[]
}

export function computeUserSnapshot(userId: string): SnapshotResult {
  const totals = computeAccountTotals(userId)
  const today = new Date().toISOString().slice(0, 10)

  let cashAmount = 0
  let investmentAmount = 0
  const currencyMismatches: string[] = []

  for (const t of totals) {
    if (t.currency !== BASE_CURRENCY) {
      // No FX yet — flag and skip non-base-currency contributions.
      currencyMismatches.push(`${t.accountId}: ${t.currency} ≠ ${BASE_CURRENCY}`)
      continue
    }
    if (t.balanceIncludesInvestments) {
      // The balance already covers cash + securities — don't double-count
      // by adding positions.marketValue on top. Treat the lot as cash for
      // simplicity (we still know it's an investment account from `kind`).
      cashAmount += t.cash
    } else {
      cashAmount += t.cash
      investmentAmount += t.investments
    }
  }

  return {
    date: today,
    totalAmount: cashAmount + investmentAmount,
    cashAmount,
    investmentAmount,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
  }
}

export function rebuildSnapshotsForUser(
  userId: string,
  opts: { onlyToday?: boolean } = {},
): SnapshotResult {
  const snap = computeUserSnapshot(userId)
  const detail = computeAccountTotals(userId)

  db.insert(dailySnapshots)
    .values({
      userId,
      date: snap.date,
      baseCurrency: snap.baseCurrency,
      totalAmount: snap.totalAmount,
      cashAmount: snap.cashAmount,
      investmentAmount: snap.investmentAmount,
      detailJson: JSON.stringify({ perAccount: detail, mismatches: snap.currencyMismatches }),
      computedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [dailySnapshots.userId, dailySnapshots.date],
      set: {
        baseCurrency: snap.baseCurrency,
        totalAmount: snap.totalAmount,
        cashAmount: snap.cashAmount,
        investmentAmount: snap.investmentAmount,
        detailJson: JSON.stringify({ perAccount: detail, mismatches: snap.currencyMismatches }),
        computedAt: Date.now(),
      },
    })
    .run()

  void opts // backfill of older dates would go here later (cash walkback etc)
  return snap
}

// Convenience for cron / boot-time recomputation across all users.
export function rebuildSnapshotsAllUsers(): { userId: string; snap: SnapshotResult }[] {
  const rows = db
    .select({ userId: connections.userId })
    .from(connections)
    .groupBy(connections.userId)
    .all()
  return rows.map((r) => ({ userId: r.userId, snap: rebuildSnapshotsForUser(r.userId) }))
}

// Used by /api/timeseries to know what's already persisted vs what needs
// reconstruction.
export function getSnapshotsRange(
  userId: string,
  fromDate: string,
  toDate: string,
): { date: string; totalAmount: number }[] {
  return db
    .select({ date: dailySnapshots.date, totalAmount: dailySnapshots.totalAmount })
    .from(dailySnapshots)
    .where(
      sql`${dailySnapshots.userId} = ${userId} AND ${dailySnapshots.date} >= ${fromDate} AND ${dailySnapshots.date} <= ${toDate}`,
    )
    .all()
}
