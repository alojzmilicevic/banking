// Daily wealth snapshots — rebuilt across the last 365 days on every sync.
//
// For each calendar day, total wealth = sum of (per-account amount on that
// day). Per-account amount comes from one of two sources, in priority:
//
//   1. accountValueHistory(account, date)  — Avanza's chart valueSeries.
//      Captures real market drift between transactions for investment
//      accounts.
//
//   2. Tx walkback from current balance — EB cash accounts (no daily
//      historical data available, but transactions cover all wealth-
//      affecting cash flows).
//
// EB cash accounts: walkback algorithm — start at today's chosen balance,
// subtract every wealth-affecting tx that occurred AFTER day D to get the
// balance at end-of-day D.
//
// Avanza investment accounts: read account_value_history[date]; fall back
// to today's totalBalance held flat if the chart wasn't fetched
// (degraded mode, but at least doesn't crash).
//
// Bucketed totals (cash vs investment) come from accounts.kind so the
// chart can show a stacked breakdown if we want one later.

import { and, desc, eq, gte, ne, sql } from 'drizzle-orm'
import {
  accountValueHistory,
  accounts,
  balances,
  connections,
  dailySnapshots,
  db,
  positions,
  transactions,
} from '@/lib/db/client'

const BASE_CURRENCY = 'SEK'

const BALANCE_PREFERENCE = [
  'totalBalance',
  'ownCapital',
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
  'cash',
]

// Tx kinds that change net wealth (in cash terms). Buy/sell/transfer are
// internal to portfolios or netted across user's own accounts and don't
// move total wealth.
const WEALTH_AFFECTING_KINDS = new Set([
  'cash_in',
  'cash_out',
  'dividend',
  'interest',
  'fee',
  'tax',
])

const MS_DAY = 86400_000

interface AccountSnapshot {
  accountId: string
  kind: string | null
  currency: string
  // Today's chosen balance amount (from balances table).
  todayAmount: number
  // True if `todayAmount` already includes investment market value.
  balanceIncludesInvestments: boolean
  // Holdings sum (only meaningful if !balanceIncludesInvestments).
  positionsValue: number
  // Tx walkback support — every wealth-affecting tx for this account.
  txs: { date: string; amount: number }[]
  // Map of date → real value from chart history (Avanza). Wins over walkback.
  history: Map<string, number>
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

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function loadAccountSnapshots(userId: string, sinceIso: string): AccountSnapshot[] {
  const userConns = db.select().from(connections).where(eq(connections.userId, userId)).all()
  const connIds = new Set(userConns.map((c) => c.id))
  const userAccounts = db
    .select()
    .from(accounts)
    .all()
    .filter((a) => connIds.has(a.connectionId) && a.excludedFromTotal !== 1)

  const out: AccountSnapshot[] = []

  for (const a of userAccounts) {
    const accBalances = db.select().from(balances).where(eq(balances.accountId, a.id)).all()
    const picked = pickBalance(accBalances)
    const todayAmount = picked?.balance.amount ?? 0
    const currency = picked?.balance.currency ?? a.currency ?? BASE_CURRENCY

    const accPositions = db.select().from(positions).where(eq(positions.accountId, a.id)).all()
    const positionsValue = accPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0)

    const txRows = db
      .select({ date: transactions.date, amount: transactions.amount, kind: transactions.kind })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, a.id),
          gte(transactions.date, sinceIso),
          ne(transactions.status, 'PDNG'),
          ne(transactions.status, 'INFO'),
        ),
      )
      .orderBy(desc(transactions.date))
      .all()
    const txs = txRows
      .filter((t) => !t.kind || WEALTH_AFFECTING_KINDS.has(t.kind))
      .map((t) => ({ date: t.date, amount: t.amount }))

    const historyRows = db
      .select({ date: accountValueHistory.date, value: accountValueHistory.value })
      .from(accountValueHistory)
      .where(
        and(
          eq(accountValueHistory.accountId, a.id),
          gte(accountValueHistory.date, sinceIso),
        ),
      )
      .all()
    const history = new Map<string, number>()
    for (const r of historyRows) history.set(r.date, r.value)

    out.push({
      accountId: a.id,
      kind: a.kind,
      currency,
      todayAmount,
      balanceIncludesInvestments: picked?.includesInvestments ?? false,
      positionsValue,
      txs,
      history,
    })
  }

  return out
}

export interface SnapshotPoint {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
}

export interface RebuildResult {
  written: number
  daysBack: number
  baseCurrency: string
  currencyMismatches: string[]
}

export function rebuildSnapshotsForUser(
  userId: string,
  opts: { daysBack?: number; onlyToday?: boolean } = {},
): RebuildResult {
  const daysBack = opts.onlyToday ? 0 : opts.daysBack ?? 365
  const now = Date.now()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const sinceIso = isoDay(new Date(today.getTime() - daysBack * MS_DAY))

  const snapshots = loadAccountSnapshots(userId, sinceIso)
  const currencyMismatches: string[] = []

  // For each account, prepare a tx walkback cursor (txs sorted desc by date).
  // The cursor walks once across all days from today backward.
  type AccountWalker = AccountSnapshot & { running: number; cursor: number }
  const walkers: AccountWalker[] = snapshots.map((s) => {
    if (s.currency !== BASE_CURRENCY) {
      currencyMismatches.push(`${s.accountId}: ${s.currency} ≠ ${BASE_CURRENCY}`)
    }
    // Initial running = today's amount (+ positions if balance doesn't include them)
    const startingTotal = s.balanceIncludesInvestments
      ? s.todayAmount
      : s.todayAmount + s.positionsValue
    return { ...s, running: startingTotal, cursor: 0 }
  })

  const points: SnapshotPoint[] = []

  for (let d = 0; d <= daysBack; d++) {
    const day = new Date(today.getTime() - d * MS_DAY)
    const dayIso = isoDay(day)

    let cashAmount = 0
    let investmentAmount = 0

    for (const w of walkers) {
      if (w.currency !== BASE_CURRENCY) continue

      // Advance the tx walkback cursor for this account: subtract every tx
      // that occurred AFTER `dayIso`. After this loop, `running` is the
      // end-of-day-`dayIso` amount derived from today's amount minus future txs.
      while (w.cursor < w.txs.length && w.txs[w.cursor].date > dayIso) {
        w.running -= w.txs[w.cursor].amount
        w.cursor++
      }

      // Per-account contribution: real history if we have it for this date,
      // else the running walkback total.
      const realHistory = w.history.get(dayIso)
      const contribution = realHistory != null ? realHistory : w.running

      const isInvestment = w.kind === 'investment' || w.kind === 'pension'
      if (isInvestment) {
        investmentAmount += contribution
      } else {
        cashAmount += contribution
      }
    }

    points.push({
      date: dayIso,
      totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
      cashAmount: Math.round(cashAmount * 100) / 100,
      investmentAmount: Math.round(investmentAmount * 100) / 100,
    })
  }

  // Persist all points in a single transaction.
  db.transaction((tx) => {
    for (const p of points) {
      tx.insert(dailySnapshots)
        .values({
          userId,
          date: p.date,
          baseCurrency: BASE_CURRENCY,
          totalAmount: p.totalAmount,
          cashAmount: p.cashAmount,
          investmentAmount: p.investmentAmount,
          detailJson: '{}',
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [dailySnapshots.userId, dailySnapshots.date],
          set: {
            baseCurrency: BASE_CURRENCY,
            totalAmount: p.totalAmount,
            cashAmount: p.cashAmount,
            investmentAmount: p.investmentAmount,
            detailJson: '{}',
            computedAt: now,
          },
        })
        .run()
    }
  })

  return {
    written: points.length,
    daysBack,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
  }
}

// Convenience: today-only computation (used by /api/timeseries for the
// current totals card without re-walking history).
export function computeTodaySnapshot(userId: string): {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  baseCurrency: string
  currencyMismatches: string[]
} {
  const now = new Date()
  const today = isoDay(now)
  const snapshots = loadAccountSnapshots(userId, today)
  let cashAmount = 0
  let investmentAmount = 0
  const currencyMismatches: string[] = []

  for (const s of snapshots) {
    if (s.currency !== BASE_CURRENCY) {
      currencyMismatches.push(`${s.accountId}: ${s.currency} ≠ ${BASE_CURRENCY}`)
      continue
    }
    const accountTotal = s.balanceIncludesInvestments
      ? s.todayAmount
      : s.todayAmount + s.positionsValue
    const isInvestment = s.kind === 'investment' || s.kind === 'pension'
    if (isInvestment) investmentAmount += accountTotal
    else cashAmount += accountTotal
  }

  return {
    date: today,
    totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
    cashAmount: Math.round(cashAmount * 100) / 100,
    investmentAmount: Math.round(investmentAmount * 100) / 100,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
  }
}

export function getSnapshotsRange(
  userId: string,
  fromDate: string,
  toDate: string,
): { date: string; totalAmount: number; cashAmount: number; investmentAmount: number }[] {
  return db
    .select({
      date: dailySnapshots.date,
      totalAmount: dailySnapshots.totalAmount,
      cashAmount: dailySnapshots.cashAmount,
      investmentAmount: dailySnapshots.investmentAmount,
    })
    .from(dailySnapshots)
    .where(
      sql`${dailySnapshots.userId} = ${userId} AND ${dailySnapshots.date} >= ${fromDate} AND ${dailySnapshots.date} <= ${toDate}`,
    )
    .orderBy(dailySnapshots.date)
    .all()
}

// Earliest snapshot date stored for a user (or null if none yet).
// Used by /api/timeseries to anchor the "ALL" period correctly.
export function getEarliestSnapshotDate(userId: string): string | null {
  const row = db
    .select({ date: sql<string>`MIN(${dailySnapshots.date})` })
    .from(dailySnapshots)
    .where(eq(dailySnapshots.userId, userId))
    .get()
  return row?.date ?? null
}
