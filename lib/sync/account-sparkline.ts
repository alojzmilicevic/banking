// Per-account daily value series for the requested lookback window. Used
// by the dashboard tiles for sparklines and the period-change pill.
//
// Investment accounts (Avanza): read from `account_value_history` — that's
// the chart endpoint's snapshot of daily total value. Captures real market
// drift between transactions.
//
// Cash accounts (EB): walkback from today's chosen balance. We subtract
// each wealth-affecting transaction with date strictly after day D to get
// the end-of-day-D balance.

import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm'
import {
  accountValueHistory,
  accounts,
  balances,
  connections,
  db,
  positions,
  transactions,
} from '@/lib/db/client'
import { balanceIncludesInvestments, pickBalance } from '@/lib/balance'

const MS_DAY = 86400_000

const WEALTH_AFFECTING_KINDS = new Set([
  'cash_in',
  'cash_out',
  'dividend',
  'interest',
  'fee',
  'tax',
])

// External money flows — deposits/withdrawals/transfers between the user's
// own accounts. Subtracted from the period's balance change so the dashboard
// reports actual investment growth (market drift + dividends − fees), not
// money the user moved in or out.
const DEPOSIT_KINDS = new Set([
  'cash_in',
  'cash_out',
  'transfer_in',
  'transfer_out',
])

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface AccountSparkline {
  accountId: string
  // [today, today-1, ..., today-days] — days+1 entries newest-first.
  values: number[]
  // Convenience: same series oldest-first as `{ date, value }[]` for charts.
  series: { date: string; value: number }[]
  // Net external money moved in (positive) or out (negative) over the
  // window. Used by the dashboard so the change pill reflects real growth
  // rather than balance change driven by deposits/withdrawals.
  netDeposits: number
}

export function buildAccountSparklines(
  userId: string,
  days: number,
): Map<string, AccountSparkline> {
  const out = new Map<string, AccountSparkline>()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const sinceIso = isoDay(new Date(today.getTime() - days * MS_DAY))

  const userAccounts = db
    .select({
      id: accounts.id,
      kind: accounts.kind,
    })
    .from(accounts)
    .innerJoin(connections, eq(accounts.connectionId, connections.id))
    .where(eq(connections.userId, userId))
    .all()

  if (userAccounts.length === 0) return out
  const accountIds = userAccounts.map((a) => a.id)

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

  function group<T extends { accountId: string }>(rows: T[]): Map<string, T[]> {
    const m = new Map<string, T[]>()
    for (const r of rows) {
      const list = m.get(r.accountId)
      if (list) list.push(r)
      else m.set(r.accountId, [r])
    }
    return m
  }

  const balancesByAcct = group(allBalances)
  const positionsByAcct = group(allPositions)
  const txsByAcct = group(allTxs)
  const historyByAcct = group(allHistory)

  for (const a of userAccounts) {
    const accBalances = balancesByAcct.get(a.id) ?? []
    const picked = pickBalance(accBalances)
    if (!picked) continue
    const accPositions = positionsByAcct.get(a.id) ?? []
    const positionsValue = accPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0)
    const startingTotal = balanceIncludesInvestments(picked.balanceType)
      ? picked.amount
      : picked.amount + positionsValue

    const accTxs = (txsByAcct.get(a.id) ?? [])
      .filter((t) => !t.kind || WEALTH_AFFECTING_KINDS.has(t.kind))
      .map((t) => ({ date: t.date, amount: t.amount }))

    // Net deposits during the change window. The walkback (and Avanza
    // history) treats day `sinceIso` as the past anchor and includes txs
    // on that day in the past balance, so we only subtract txs strictly
    // after it — matches the (today - past) delta the change pill uses.
    const netDeposits = (txsByAcct.get(a.id) ?? [])
      .filter((t) => t.kind && DEPOSIT_KINDS.has(t.kind) && t.date > sinceIso)
      .reduce((s, t) => s + t.amount, 0)

    const history = new Map<string, number>()
    for (const r of historyByAcct.get(a.id) ?? []) history.set(r.date, r.value)

    let running = startingTotal
    let cursor = 0
    const newestFirst: number[] = []
    for (let d = 0; d <= days; d++) {
      const day = new Date(today.getTime() - d * MS_DAY)
      const dayIso = isoDay(day)
      while (cursor < accTxs.length && accTxs[cursor].date > dayIso) {
        running -= accTxs[cursor].amount
        cursor++
      }
      const real = history.get(dayIso)
      newestFirst.push(real != null ? real : running)
    }

    const oldestFirst = newestFirst.slice().reverse()
    const series = oldestFirst.map((value, i) => {
      const day = new Date(today.getTime() - (days - i) * MS_DAY)
      return { date: isoDay(day), value: Math.round(value * 100) / 100 }
    })

    out.set(a.id, {
      accountId: a.id,
      values: newestFirst.map((v) => Math.round(v * 100) / 100),
      series,
      netDeposits: Math.round(netDeposits * 100) / 100,
    })
  }

  return out
}
