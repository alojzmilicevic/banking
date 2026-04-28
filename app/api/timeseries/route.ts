import { NextResponse } from 'next/server'
import { and, desc, gte, ne, sql } from 'drizzle-orm'
import { connections, db, transactions, users } from '@/lib/db/client'
import {
  computeAccountTotals,
  computeUserSnapshot,
  getSnapshotsRange,
} from '@/lib/sync/snapshots'

const MS_DAY = 86400_000

// Tx kinds that move money in/out of total wealth. Buy/sell/transfer/fx
// are *internal* to the account or netted across accounts — they don't
// change net worth, so they're excluded from the walkback.
const WEALTH_AFFECTING_KINDS = new Set([
  'cash_in',
  'cash_out',
  'dividend',
  'interest',
  'fee',
  'tax',
])

interface SeriesPoint {
  date: string
  total: number
  source: 'snapshot' | 'reconstructed'
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const user = db.select().from(users).get()
  if (!user) {
    return NextResponse.json({ series: [], currency: null, accounts: 0 })
  }

  // ── Today's totals (always computed live) ─────────────────────────────
  const totals = computeAccountTotals(user.id)
  const todaySnap = computeUserSnapshot(user.id)
  const currentTotal = todaySnap.totalAmount

  // ── Tx-based walkback covers the cash side over the last 365 days.
  // Investments are held flat at today's value (no historical price data
  // to do better). Once daily_snapshots accumulate over time, those win
  // over the walkback for the dates they cover.
  const userConns = db.select().from(connections).where(sql`${connections.userId} = ${user.id}`).all()
  const userAccountIds = totals.map((t) => t.accountId)

  const since = isoDay(new Date(Date.now() - 365 * MS_DAY))
  const today = isoDay(new Date())

  const rawTxs =
    userAccountIds.length === 0
      ? []
      : db
          .select({
            date: transactions.date,
            amount: transactions.amount,
            kind: transactions.kind,
          })
          .from(transactions)
          .where(
            and(
              gte(transactions.date, since),
              ne(transactions.status, 'PDNG'),
              ne(transactions.status, 'INFO'),
              sql`${transactions.accountId} IN (${sql.join(
                userAccountIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          )
          .orderBy(desc(transactions.date))
          .all()
          .filter((t) => !t.kind || WEALTH_AFFECTING_KINDS.has(t.kind))

  // Walk back day by day, subtracting wealth-affecting txs that occurred
  // strictly after each snapshot day.
  const points: SeriesPoint[] = []
  let running = currentTotal
  let cursor = 0

  for (let d = 0; d <= 365; d++) {
    const dayStart = new Date(Date.now() - d * MS_DAY)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayIso = isoDay(dayStart)

    while (cursor < rawTxs.length && rawTxs[cursor].date > dayIso) {
      running -= rawTxs[cursor].amount
      cursor++
    }
    points.push({
      date: dayIso,
      total: Math.round(running * 100) / 100,
      source: 'reconstructed',
    })
  }

  points.reverse()

  // ── Overlay actual snapshots where we have them. They beat the
  // reconstruction because they capture investment market drift the
  // walkback can't see.
  if (userConns.length > 0) {
    const snaps = getSnapshotsRange(user.id, since, today)
    const map = new Map(snaps.map((s) => [s.date, s.totalAmount]))
    for (const p of points) {
      const real = map.get(p.date)
      if (real != null) {
        p.total = Math.round(real * 100) / 100
        p.source = 'snapshot'
      }
    }
  }

  return NextResponse.json({
    series: points.map((p) => ({ date: p.date, total: p.total, source: p.source })),
    currency: todaySnap.baseCurrency,
    accounts: totals.length,
    cashTotal: Math.round(todaySnap.cashAmount * 100) / 100,
    investmentTotal: Math.round(todaySnap.investmentAmount * 100) / 100,
    snapshots: points.filter((p) => p.source === 'snapshot').length,
    errors: todaySnap.currencyMismatches.length ? todaySnap.currencyMismatches : undefined,
  })
}
