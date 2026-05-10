// Daily wealth snapshots — per-account-per-day storage, aggregated at
// read time so toggling an account's `excluded_from_total` flag is a
// single UPDATE rather than a 365-day rebuild.
//
// For each calendar day, total wealth = sum of (per-account amount on
// that day) over accounts that aren't currently excluded. Per-account
// amount comes from one of two sources, in priority:
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

import * as accountDailySnapshotsRepo from '@/lib/repositories/account-daily-snapshots'
import * as accountsRepo from '@/lib/repositories/accounts'
import * as accountValueHistoryRepo from '@/lib/repositories/account-value-history'
import * as balancesRepo from '@/lib/repositories/balances'
import * as holdersRepo from '@/lib/repositories/holders'
import * as positionsRepo from '@/lib/repositories/positions'
import * as transactionsRepo from '@/lib/repositories/transactions'
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

// A bucket key for the per-day breakdown. Values: a `holders.id` (uuid),
// or one of the magic strings below. Strings vs union because the holder
// set is dynamic now (N people).
export type HolderBucket = string

export const SHARED_BUCKET = 'shared'
export const UNASSIGNED_BUCKET = 'unassigned'

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
  // Whether the account is currently flagged as excluded from totals.
  // Carried through compute → persistence so the rebuild captures the
  // current state, but reads always re-read the live flag from the DB
  // (the persisted value is informational only).
  excludedFromTotal: boolean
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function loadAccountSnapshots(userId: string, sinceIso: string): AccountSnapshot[] {
  const rawUserAccounts = accountsRepo.listForUser(userId)
  if (rawUserAccounts.length === 0) return []

  // Per-connection holder set from the M:N table.
  //   • 0 holders → unassigned
  //   • 1 holder  → personal (use that holderId as the bucket)
  //   • 2+ holders → explicit joint (shared bucket)
  const connectionIds = Array.from(new Set(rawUserAccounts.map((a) => a.connectionId)))
  const holderIdsByConn = holdersRepo.getHolderIdsByConnection(connectionIds)

  // Joint dedup: when the same physical account (same IBAN/BBAN) is
  // linked by different holder sets, both rows return separately. Without
  // dedup the snapshot rebuild would sum the balance twice. Keep the
  // earliest-created as canonical, drop the rest, and rewrite the
  // canonical's bucket to SHARED_BUCKET so the per-holder series reflects
  // shared ownership instead of attributing it to whoever linked first.
  const groups = new Map<
    string,
    { canonicalId: string; canonicalCreatedAt: number; ownerKeys: Set<string> }
  >()
  for (const a of rawUserAccounts) {
    const ext = (a.iban ?? a.bban ?? '').trim()
    if (!ext) continue
    const ownerKey = (holderIdsByConn.get(a.connectionId) ?? []).slice().sort().join(',') || ''
    const g = groups.get(ext)
    if (!g) {
      groups.set(ext, {
        canonicalId: a.id,
        canonicalCreatedAt: a.createdAt,
        ownerKeys: new Set([ownerKey]),
      })
    } else {
      g.ownerKeys.add(ownerKey)
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
      const ibanJoint = !!g && g.ownerKeys.size > 1
      const connHolders = holderIdsByConn.get(a.connectionId) ?? []
      let holder: HolderBucket
      if (ibanJoint || connHolders.length >= 2) holder = SHARED_BUCKET
      else if (connHolders.length === 1) holder = connHolders[0]
      else holder = UNASSIGNED_BUCKET
      return { ...a, holder }
    })

  const accountIds = userAccounts.map((a) => a.id)

  // Batch the four per-account queries into one round-trip each. Each uses
  // the existing per-account index (balances_pk, positions_pk,
  // transactions_by_account_date, account_value_history_pk).
  const allBalances = balancesRepo.listByAccountIds(accountIds)
  const allPositions = positionsRepo.listByAccountIds(accountIds)
  const allTxs = transactionsRepo.listBookedSinceForAccountIds(accountIds, sinceIso)
  const allHistory = accountValueHistoryRepo.listByAccountIdsSince(accountIds, sinceIso)

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
      // Already classified above (holderId | SHARED_BUCKET | UNASSIGNED_BUCKET).
      holder: a.holder,
      todayAmount,
      balanceIncludesInvestments: picked ? balanceIncludesInvestments(picked.balanceType) : false,
      positionsValue,
      txs,
      history,
      earliestHistoryDate,
      excludedFromTotal: a.excludedFromTotal === 1,
    }
  })
}

export interface SnapshotPoint {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  // Per-holder breakdown — drives the chart's per-person lines.
  // Keyed by `holders.id`. `shared` and `unassigned` are separate
  // fields below since they're not holders.
  byHolder: Record<string, number>
  sharedAmount: number
  unassignedAmount: number
}

// One per (account, day). The walker emits these; the aggregator groups
// them by date. Persisted in `account_daily_snapshots` so the read path
// can re-aggregate with the live `excluded_from_total` flag.
export interface AccountDailyContribution {
  accountId: string
  date: string
  amount: number
  kind: string | null
  holderBucket: HolderBucket
}

export interface RebuildResult {
  written: number
  daysBack: number
  baseCurrency: string
  currencyMismatches: string[]
}

// Pure walkback math: given today's per-account state, project each
// account's per-day contribution back `daysBack` days. Side-effect free —
// callers handle DB I/O. Currency-mismatched accounts are dropped from
// the contribution stream and reported separately.
//
// Currently-excluded accounts are still included in the contributions
// (with their flag carried) so the persisted rows can be re-aggregated
// after a future toggle without recomputing history. The aggregator is
// responsible for filtering them out.
export function computeAccountContributions(
  snapshots: AccountSnapshot[],
  today: Date,
  daysBack: number,
): { contributions: AccountDailyContribution[]; currencyMismatches: string[] } {
  const currencyMismatches: string[] = []
  const contributions: AccountDailyContribution[] = []

  for (const s of snapshots) {
    if (s.currency !== BASE_CURRENCY) {
      currencyMismatches.push(`${s.accountId}: ${s.currency} ≠ ${BASE_CURRENCY}`)
      continue
    }

    let running = s.balanceIncludesInvestments
      ? s.todayAmount
      : s.todayAmount + s.positionsValue
    let cursor = 0

    for (let d = 0; d <= daysBack; d++) {
      const day = new Date(today.getTime() - d * MS_DAY)
      const dayIso = isoDay(day)

      // Subtract every tx with date strictly after dayIso so `running`
      // becomes the end-of-day-`dayIso` amount.
      while (cursor < s.txs.length && s.txs[cursor].date > dayIso) {
        running -= s.txs[cursor].amount
        cursor++
      }

      // Real history (Avanza chart) wins over walkback when present.
      // `!= null` keeps a real 0 from being treated as missing.
      const realHistory = s.history.get(dayIso)
      let amount: number
      if (realHistory != null) {
        amount = realHistory
      } else if (s.earliestHistoryDate != null && dayIso < s.earliestHistoryDate) {
        // Account has chart history but not for this day, and the day is
        // before the chart's earliest point — treat as "didn't exist yet".
        // Without this, Avanza accounts (which sync no transactions) would
        // flat-line at today's totalBalance going back 365 days.
        amount = 0
      } else {
        amount = running
      }

      contributions.push({
        accountId: s.accountId,
        date: dayIso,
        amount: Math.round(amount * 100) / 100,
        kind: s.kind,
        holderBucket: s.holder,
      })
    }
  }

  return { contributions, currencyMismatches }
}

// Aggregate per-account contributions into per-day totals. Drops rows
// flagged as excluded so the read path can re-bucket on demand. Used by
// both the rebuild path (excludedFromTotal taken from the live DB at
// load time) and the read path (taken from the join in the repo query).
//
// `holderIds` seeds the byHolder map so holders with zero accounts still
// produce a flat line in the chart instead of being absent from the data.
//
// `seedDates` (optional): explicit list of dates to guarantee in the
// output even when no contribution row references them — used when the
// caller wants `daysBack+1` zero-points regardless of account presence
// (e.g. the legacy `computeSnapshotPoints` contract).
export function aggregateContributions(
  rows: Array<AccountDailyContribution & { excludedFromTotal: boolean }>,
  holderIds: string[] = [],
  seedDates: string[] = [],
): SnapshotPoint[] {
  const byDate = new Map<
    string,
    {
      cash: number
      investment: number
      shared: number
      unassigned: number
      byHolder: Record<string, number>
    }
  >()

  function bucketFor(date: string) {
    let b = byDate.get(date)
    if (b) return b
    const byHolder: Record<string, number> = {}
    for (const id of holderIds) byHolder[id] = 0
    b = { cash: 0, investment: 0, shared: 0, unassigned: 0, byHolder }
    byDate.set(date, b)
    return b
  }

  // Seed every date the caller asked for, plus every date that appears
  // in the row stream — that way an excluded-only day still produces a
  // zero point and a fully empty input still produces the requested
  // window of zeros.
  for (const d of seedDates) bucketFor(d)
  for (const r of rows) bucketFor(r.date)

  for (const r of rows) {
    if (r.excludedFromTotal) continue
    const b = bucketFor(r.date)
    const isInvestment = r.kind === 'investment' || r.kind === 'pension'
    if (isInvestment) b.investment += r.amount
    else b.cash += r.amount

    if (r.holderBucket === SHARED_BUCKET) b.shared += r.amount
    else if (r.holderBucket === UNASSIGNED_BUCKET) b.unassigned += r.amount
    else b.byHolder[r.holderBucket] = (b.byHolder[r.holderBucket] ?? 0) + r.amount
  }

  const points: SnapshotPoint[] = []
  for (const [date, b] of byDate.entries()) {
    const roundedByHolder: Record<string, number> = {}
    for (const [k, v] of Object.entries(b.byHolder)) {
      roundedByHolder[k] = Math.round(v * 100) / 100
    }
    points.push({
      date,
      totalAmount: Math.round((b.cash + b.investment) * 100) / 100,
      cashAmount: Math.round(b.cash * 100) / 100,
      investmentAmount: Math.round(b.investment * 100) / 100,
      byHolder: roundedByHolder,
      sharedAmount: Math.round(b.shared * 100) / 100,
      unassignedAmount: Math.round(b.unassigned * 100) / 100,
    })
  }
  // Walker emits dates today→backwards; aggregator returns same order so
  // existing tests on `computeSnapshotPoints` stay valid.
  points.sort((a, b) => b.date.localeCompare(a.date))
  return points
}

// Backwards-compatible helper for unit tests: walk + aggregate in one
// pass. Real code paths call walker + aggregator separately so the
// per-account rows can be persisted between them.
export function computeSnapshotPoints(
  snapshots: AccountSnapshot[],
  today: Date,
  daysBack: number,
  holderIds: string[] = [],
): { points: SnapshotPoint[]; currencyMismatches: string[] } {
  const { contributions, currencyMismatches } = computeAccountContributions(
    snapshots,
    today,
    daysBack,
  )
  const rows = contributions.map((c) => {
    const src = snapshots.find((s) => s.accountId === c.accountId)
    return { ...c, excludedFromTotal: src?.excludedFromTotal ?? false }
  })
  // Seed the full daysBack window so an empty `snapshots` input still
  // returns daysBack+1 zero-points (the legacy contract this helper
  // preserves).
  const seedDates: string[] = []
  for (let d = 0; d <= daysBack; d++) {
    seedDates.push(isoDay(new Date(today.getTime() - d * MS_DAY)))
  }
  return {
    points: aggregateContributions(rows, holderIds, seedDates),
    currencyMismatches,
  }
}

// Recompute every account_daily_snapshots row for a user. Call this AFTER
// any mutation that changes a value the chart reads (balances, positions,
// transactions, account_value_history, the M:N connection_holders, or
// the connection set itself).
//
// Notably NOT needed for `excluded_from_total` toggles — that filter is
// applied at read time, so the toggle is a single UPDATE.
//
// Don't call this directly from a route handler — the wealth service
// (lib/services/wealth.ts) is the single funnel for wealth-mutating
// operations and already invokes this internally. The orchestrator's
// `syncConnection` also calls it after a successful sync.
export function rebuildSnapshotsForUser(
  userId: string,
  opts: { daysBack?: number; onlyToday?: boolean } = {},
): RebuildResult {
  const daysBack = opts.onlyToday ? 0 : opts.daysBack ?? 365
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const sinceIso = isoDay(new Date(today.getTime() - daysBack * MS_DAY))

  const snapshots = loadAccountSnapshots(userId, sinceIso)
  const { contributions, currencyMismatches } = computeAccountContributions(
    snapshots,
    today,
    daysBack,
  )

  accountDailySnapshotsRepo.replaceForUser(
    userId,
    contributions.map((c) => ({
      userId,
      accountId: c.accountId,
      date: c.date,
      amount: c.amount,
      kind: c.kind,
      holderBucket: c.holderBucket,
    })),
  )

  return {
    written: contributions.length,
    daysBack,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
  }
}

// Convenience: today-only computation (used by /api/timeseries for the
// current totals card without re-walking history). Filters excluded
// accounts at aggregation time so the totals match what the chart shows.
export function computeTodaySnapshot(userId: string): {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  baseCurrency: string
  currencyMismatches: string[]
  byHolder: Record<string, number>
  sharedAmount: number
  unassignedAmount: number
} {
  const now = new Date()
  const today = isoDay(now)
  const snapshots = loadAccountSnapshots(userId, today)
  const holderIds = holdersRepo.listLinkedIdsForUser(userId)
  let cashAmount = 0
  let investmentAmount = 0
  let sharedAmount = 0
  let unassignedAmount = 0
  const currencyMismatches: string[] = []
  const byHolder: Record<string, number> = {}
  for (const id of holderIds) byHolder[id] = 0

  for (const s of snapshots) {
    if (s.currency !== BASE_CURRENCY) {
      currencyMismatches.push(`${s.accountId}: ${s.currency} ≠ ${BASE_CURRENCY}`)
      continue
    }
    if (s.excludedFromTotal) continue
    const accountTotal = s.balanceIncludesInvestments
      ? s.todayAmount
      : s.todayAmount + s.positionsValue
    const isInvestment = s.kind === 'investment' || s.kind === 'pension'
    if (isInvestment) investmentAmount += accountTotal
    else cashAmount += accountTotal

    if (s.holder === SHARED_BUCKET) sharedAmount += accountTotal
    else if (s.holder === UNASSIGNED_BUCKET) unassignedAmount += accountTotal
    else byHolder[s.holder] = (byHolder[s.holder] ?? 0) + accountTotal
  }

  const rounded: Record<string, number> = {}
  for (const [k, v] of Object.entries(byHolder)) rounded[k] = Math.round(v * 100) / 100

  return {
    date: today,
    totalAmount: Math.round((cashAmount + investmentAmount) * 100) / 100,
    cashAmount: Math.round(cashAmount * 100) / 100,
    investmentAmount: Math.round(investmentAmount * 100) / 100,
    baseCurrency: BASE_CURRENCY,
    currencyMismatches,
    byHolder: rounded,
    sharedAmount: Math.round(sharedAmount * 100) / 100,
    unassignedAmount: Math.round(unassignedAmount * 100) / 100,
  }
}

export interface SnapshotRangeRow {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  byHolder: Record<string, number>
  sharedAmount: number
  unassignedAmount: number
}

// Read-time aggregation. The repo already joined `excluded_from_total`,
// so per-row exclusion reflects the live DB state — toggling the flag
// changes what appears in the next read without a rebuild.
export function getSnapshotsRange(
  userId: string,
  fromDate: string,
  toDate: string,
): SnapshotRangeRow[] {
  const rows = accountDailySnapshotsRepo.getRangeForUser(userId, fromDate, toDate)
  if (rows.length === 0) return []
  const holderIds = holdersRepo.listLinkedIdsForUser(userId)
  const points = aggregateContributions(
    rows.map((r) => ({
      accountId: r.accountId,
      date: r.date,
      amount: r.amount,
      kind: r.kind,
      holderBucket: r.holderBucket,
      excludedFromTotal: r.excludedFromTotal === 1,
    })),
    holderIds,
  )
  // Range reads expect ascending date order (caller iterates oldest →
  // newest into the chart), but the aggregator returns descending to
  // match the legacy `computeSnapshotPoints` shape. Reverse here.
  points.reverse()
  return points.map((p) => ({
    date: p.date,
    totalAmount: p.totalAmount,
    cashAmount: p.cashAmount,
    investmentAmount: p.investmentAmount,
    byHolder: p.byHolder,
    sharedAmount: p.sharedAmount,
    unassignedAmount: p.unassignedAmount,
  }))
}

// Earliest snapshot date stored for a user (or null if none yet).
// Used by /api/timeseries to anchor the "ALL" period correctly. Only
// considers non-excluded accounts so the period anchor doesn't jump
// when an excluded account predates everything else.
export function getEarliestSnapshotDate(userId: string): string | null {
  return accountDailySnapshotsRepo.getEarliestDateForUser(userId)
}
