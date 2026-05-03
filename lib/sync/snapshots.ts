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

export type HolderBucket = 'alma' | 'alojz' | 'joint' | 'unassigned'

export interface AccountSnapshot {
  accountId: string
  kind: string | null
  currency: string
  // Holder of the connection this account belongs to. Used to bucket the
  // per-day contribution into per-holder series for the chart.
  holder: HolderBucket
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
  const rawUserAccounts = db
    .select({
      id: accounts.id,
      kind: accounts.kind,
      currency: accounts.currency,
      holder: connections.holder,
      iban: accounts.iban,
      bban: accounts.bban,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(and(eq(connections.userId, userId), ne(accounts.excludedFromTotal, 1)))
    .all()

  if (rawUserAccounts.length === 0) return []

  // Joint dedup: when the same physical account (same IBAN/BBAN) is
  // linked by both holders, both connections return it as a separate row.
  // Without dedup the snapshot rebuild would sum its balance twice. We
  // keep the earliest-created copy as canonical and drop the rest from
  // the totals; the canonical's holder is rewritten to 'joint' so the
  // per-holder breakdown reflects the shared ownership instead of
  // arbitrarily attributing it to whoever happened to link first.
  const groups = new Map<
    string,
    { canonicalId: string; canonicalCreatedAt: number; holders: Set<string> }
  >()
  for (const a of rawUserAccounts) {
    const ext = (a.iban ?? a.bban ?? '').trim()
    if (!ext) continue
    const g = groups.get(ext)
    if (!g) {
      groups.set(ext, {
        canonicalId: a.id,
        canonicalCreatedAt: a.createdAt,
        holders: new Set(a.holder ? [a.holder] : []),
      })
    } else {
      if (a.holder) g.holders.add(a.holder)
      if (a.createdAt < g.canonicalCreatedAt) {
        g.canonicalCreatedAt = a.createdAt
        g.canonicalId = a.id
      }
    }
  }
  const userAccounts = rawUserAccounts
    .filter((a) => {
      const ext = (a.iban ?? a.bban ?? '').trim()
      if (!ext) return true
      const g = groups.get(ext)
      return !g || g.canonicalId === a.id
    })
    .map((a) => {
      const ext = (a.iban ?? a.bban ?? '').trim()
      const g = ext ? groups.get(ext) : undefined
      const isJoint = !!g && g.holders.size > 1
      return {
        ...a,
        // Override holder for joint accounts so the per-holder breakdown
        // sees them as 'joint' rather than attributing to the linker.
        holder: isJoint ? 'joint' : a.holder,
      }
    })

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

    const holder: HolderBucket =
      a.holder === 'alma' || a.holder === 'alojz' || a.holder === 'joint'
        ? a.holder
        : 'unassigned'

    return {
      accountId: a.id,
      kind: a.kind,
      currency,
      holder,
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
  // Per-holder breakdown — drives the chart's per-person lines and the
  // SummaryCards trio. `unassigned` is for legacy connections that have
  // no holder set yet; merged into the combined total but shown nowhere
  // per-holder.
  byHolder: Record<HolderBucket, number>
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
    const byHolder: Record<HolderBucket, number> = {
      alma: 0,
      alojz: 0,
      joint: 0,
      unassigned: 0,
    }

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
      byHolder[w.holder] += contribution
    }

    points.push({
      date: dayIso,
      totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
      cashAmount: Math.round(cashAmount * 100) / 100,
      investmentAmount: Math.round(investmentAmount * 100) / 100,
      byHolder: {
        alma: Math.round(byHolder.alma * 100) / 100,
        alojz: Math.round(byHolder.alojz * 100) / 100,
        joint: Math.round(byHolder.joint * 100) / 100,
        unassigned: Math.round(byHolder.unassigned * 100) / 100,
      },
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
      const detailJson = JSON.stringify({ byHolder: p.byHolder })
      tx.insert(dailySnapshots)
        .values({
          userId,
          date: p.date,
          baseCurrency: BASE_CURRENCY,
          totalAmount: p.totalAmount,
          cashAmount: p.cashAmount,
          investmentAmount: p.investmentAmount,
          detailJson,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [dailySnapshots.userId, dailySnapshots.date],
          set: {
            baseCurrency: BASE_CURRENCY,
            totalAmount: p.totalAmount,
            cashAmount: p.cashAmount,
            investmentAmount: p.investmentAmount,
            detailJson,
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
  byHolder: Record<HolderBucket, number>
} {
  const now = new Date()
  const today = isoDay(now)
  const snapshots = loadAccountSnapshots(userId, today)
  let cashAmount = 0
  let investmentAmount = 0
  const currencyMismatches: string[] = []
  const byHolder: Record<HolderBucket, number> = {
    alma: 0,
    alojz: 0,
    joint: 0,
    unassigned: 0,
  }

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
    byHolder[s.holder] += accountTotal
  }

  return {
    date: today,
    totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
    cashAmount: Math.round(cashAmount * 100) / 100,
    investmentAmount: Math.round(investmentAmount * 100) / 100,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
    byHolder: {
      alma: Math.round(byHolder.alma * 100) / 100,
      alojz: Math.round(byHolder.alojz * 100) / 100,
      joint: Math.round(byHolder.joint * 100) / 100,
      unassigned: Math.round(byHolder.unassigned * 100) / 100,
    },
  }
}

export interface SnapshotRangeRow {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  byHolder: Record<HolderBucket, number>
}

function emptyByHolder(): Record<HolderBucket, number> {
  return { alma: 0, alojz: 0, joint: 0, unassigned: 0 }
}

function parseByHolder(detailJson: string | null | undefined): Record<HolderBucket, number> {
  if (!detailJson) return emptyByHolder()
  try {
    const parsed = JSON.parse(detailJson) as { byHolder?: Partial<Record<HolderBucket, number>> }
    const src = parsed.byHolder ?? {}
    return {
      alma: src.alma ?? 0,
      alojz: src.alojz ?? 0,
      joint: src.joint ?? 0,
      unassigned: src.unassigned ?? 0,
    }
  } catch {
    return emptyByHolder()
  }
}

export function getSnapshotsRange(
  userId: string,
  fromDate: string,
  toDate: string,
): SnapshotRangeRow[] {
  const rows = db
    .select({
      date: dailySnapshots.date,
      totalAmount: dailySnapshots.totalAmount,
      cashAmount: dailySnapshots.cashAmount,
      investmentAmount: dailySnapshots.investmentAmount,
      detailJson: dailySnapshots.detailJson,
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

  return rows.map((r) => ({
    date: r.date,
    totalAmount: r.totalAmount,
    cashAmount: r.cashAmount,
    investmentAmount: r.investmentAmount,
    byHolder: parseByHolder(r.detailJson),
  }))
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
