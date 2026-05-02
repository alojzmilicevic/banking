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

import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
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
import { balanceIncludesInvestments, pickBalance } from '@/lib/balance'

const BASE_CURRENCY = 'SEK'

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

export interface AccountSnapshot {
  accountId: string
  kind: string | null
  currency: string
  // Today's chosen balance amount (from balances table).
  todayAmount: number
  // True if `todayAmount` already includes investment market value.
  balanceIncludesInvestments: boolean
  // Holdings sum (only meaningful if !balanceIncludesInvestments).
  positionsValue: number
  // Tx walkback support — every wealth-affecting tx for this account,
  // sorted DESC by date (most recent first). The walker assumes this
  // ordering; loadAccountSnapshots is the only producer and orders
  // correctly.
  txs: { date: string; amount: number }[]
  // Map of date → real value from chart history (Avanza). Wins over walkback.
  history: Map<string, number>
  // Earliest date with chart history (or null if none). Days before this
  // are treated as "account didn't exist yet" → 0, instead of flat-lining
  // at today's value via walkback.
  earliestHistoryDate: string | null
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function loadAccountSnapshots(userId: string, sinceIso: string): AccountSnapshot[] {
  // User's accounts in one indexed query — joins via connections.user_id and
  // pushes the excluded_from_total filter into SQL (was a JS .filter on a
  // full-table scan).
  const userAccounts = db
    .select({
      id: accounts.id,
      kind: accounts.kind,
      currency: accounts.currency,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(and(eq(connections.userId, userId), ne(accounts.excludedFromTotal, 1)))
    .all()

  if (userAccounts.length === 0) return []
  const accountIds = userAccounts.map((a) => a.id)

  // Batch the four per-account queries into one round-trip each. Each uses
  // the existing per-account index (balances_pk, positions_pk,
  // transactions_by_account_date, account_value_history_pk).
  const allBalances = db
    .select()
    .from(balances)
    .where(inArray(balances.accountId, accountIds))
    .all()

  const allPositions = db
    .select({ accountId: positions.accountId, marketValue: positions.marketValue })
    .from(positions)
    .where(inArray(positions.accountId, accountIds))
    .all()

  // Global ORDER BY date DESC: after grouping by accountId, each per-account
  // list is still in date-desc order (stable insertion).
  const allTxs = db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        gte(transactions.date, sinceIso),
        ne(transactions.status, 'PDNG'),
        ne(transactions.status, 'INFO'),
      ),
    )
    .orderBy(desc(transactions.date))
    .all()

  const allHistory = db
    .select({
      accountId: accountValueHistory.accountId,
      date: accountValueHistory.date,
      value: accountValueHistory.value,
    })
    .from(accountValueHistory)
    .where(
      and(
        inArray(accountValueHistory.accountId, accountIds),
        gte(accountValueHistory.date, sinceIso),
      ),
    )
    .all()

  function groupByAccountId<T extends { accountId: string }>(rows: T[]): Map<string, T[]> {
    const m = new Map<string, T[]>()
    for (const r of rows) {
      const list = m.get(r.accountId)
      if (list) list.push(r)
      else m.set(r.accountId, [r])
    }
    return m
  }
  const balancesByAcct = groupByAccountId(allBalances)
  const positionsByAcct = groupByAccountId(allPositions)
  const txsByAcct = groupByAccountId(allTxs)
  const historyByAcct = groupByAccountId(allHistory)

  return userAccounts.map((a) => {
    const accBalances = balancesByAcct.get(a.id) ?? []
    const picked = pickBalance(accBalances)
    const todayAmount = picked?.amount ?? 0
    const currency = picked?.currency ?? a.currency ?? BASE_CURRENCY

    const accPositions = positionsByAcct.get(a.id) ?? []
    const positionsValue = accPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0)

    const accTxs = txsByAcct.get(a.id) ?? []
    const txs = accTxs
      .filter((t) => !t.kind || WEALTH_AFFECTING_KINDS.has(t.kind))
      .map((t) => ({ date: t.date, amount: t.amount }))

    const history = new Map<string, number>()
    let earliestHistoryDate: string | null = null
    for (const r of historyByAcct.get(a.id) ?? []) {
      history.set(r.date, r.value)
      if (earliestHistoryDate === null || r.date < earliestHistoryDate) {
        earliestHistoryDate = r.date
      }
    }

    return {
      accountId: a.id,
      kind: a.kind,
      currency,
      todayAmount,
      balanceIncludesInvestments: picked ? balanceIncludesInvestments(picked.balanceType) : false,
      positionsValue,
      txs,
      history,
      earliestHistoryDate,
    }
  })
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

// Pure walkback math: given today's per-account state, project a per-day
// total wealth series back `daysBack` days. Side-effect free — callers
// (rebuildSnapshotsForUser) handle the surrounding DB I/O. This is the
// part that actually matters for testing; the I/O wrappers are dumb.
export function computeSnapshotPoints(
  snapshots: AccountSnapshot[],
  today: Date,
  daysBack: number,
): { points: SnapshotPoint[]; currencyMismatches: string[] } {
  const currencyMismatches: string[] = []

  type AccountWalker = AccountSnapshot & { running: number; cursor: number }
  const walkers: AccountWalker[] = snapshots.map((s) => {
    if (s.currency !== BASE_CURRENCY) {
      currencyMismatches.push(`${s.accountId}: ${s.currency} ≠ ${BASE_CURRENCY}`)
    }
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

      // Subtract every tx with date strictly after dayIso so `running`
      // becomes the end-of-day-`dayIso` amount.
      while (w.cursor < w.txs.length && w.txs[w.cursor].date > dayIso) {
        w.running -= w.txs[w.cursor].amount
        w.cursor++
      }

      // Real history (Avanza chart) wins over walkback when present.
      // `!= null` keeps a real 0 from being treated as missing.
      const realHistory = w.history.get(dayIso)
      let contribution: number
      if (realHistory != null) {
        contribution = realHistory
      } else if (w.earliestHistoryDate != null && dayIso < w.earliestHistoryDate) {
        // Account has chart history but not for this day, and the day is
        // before the chart's earliest point — treat as "didn't exist yet".
        // Without this, Avanza accounts (which sync no transactions) would
        // flat-line at today's totalBalance going back 365 days.
        contribution = 0
      } else {
        contribution = w.running
      }

      const isInvestment = w.kind === 'investment' || w.kind === 'pension'
      if (isInvestment) investmentAmount += contribution
      else cashAmount += contribution
    }

    points.push({
      date: dayIso,
      totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
      cashAmount: Math.round(cashAmount * 100) / 100,
      investmentAmount: Math.round(investmentAmount * 100) / 100,
    })
  }

  return { points, currencyMismatches }
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
  const { points, currencyMismatches } = computeSnapshotPoints(snapshots, today, daysBack)

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
      and(
        eq(dailySnapshots.userId, userId),
        gte(dailySnapshots.date, fromDate),
        lte(dailySnapshots.date, toDate),
      ),
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
