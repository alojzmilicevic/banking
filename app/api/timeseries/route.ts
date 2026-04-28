import { NextResponse } from 'next/server'
import { db, users } from '@/lib/db/client'
import {
  computeTodaySnapshot,
  getSnapshotsRange,
} from '@/lib/sync/snapshots'

const MS_DAY = 86400_000

// Period codes: how far back the chart looks. All snapshots already
// live in daily_snapshots — this just slices the date range.
const PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const
type Period = (typeof PERIODS)[number]

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function periodFromDate(period: Period, today: Date): string {
  const t = new Date(today)
  t.setUTCHours(0, 0, 0, 0)
  switch (period) {
    case '1W':
      return isoDay(new Date(t.getTime() - 7 * MS_DAY))
    case '1M':
      return isoDay(new Date(t.getTime() - 30 * MS_DAY))
    case '3M':
      return isoDay(new Date(t.getTime() - 90 * MS_DAY))
    case '6M':
      return isoDay(new Date(t.getTime() - 180 * MS_DAY))
    case 'YTD': {
      const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
      return isoDay(jan1)
    }
    case '1Y':
      return isoDay(new Date(t.getTime() - 365 * MS_DAY))
    case 'ALL':
    default:
      // Bounded by what we have (365 days). Future-proof: when we extend
      // history, ALL should pick the earliest snapshot date.
      return '0000-01-01'
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const periodParam = url.searchParams.get('period') ?? '1Y'
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : '1Y'

  const user = db.select().from(users).get()
  if (!user) {
    return NextResponse.json({ series: [], currency: null, accounts: 0, period })
  }

  const today = computeTodaySnapshot(user.id)
  const fromIso = periodFromDate(period, new Date())
  const snaps = getSnapshotsRange(user.id, fromIso, today.date)

  const series = snaps.length
    ? snaps.map((s) => ({
        date: s.date,
        total: s.totalAmount,
        cash: s.cashAmount,
        investments: s.investmentAmount,
      }))
    : [
        {
          date: today.date,
          total: today.totalAmount,
          cash: today.cashAmount,
          investments: today.investmentAmount,
        },
      ]

  return NextResponse.json({
    series,
    currency: today.baseCurrency,
    accounts: snaps.length,
    cashTotal: today.cashAmount,
    investmentTotal: today.investmentAmount,
    period,
    snapshots: snaps.length,
    errors: today.currencyMismatches.length ? today.currencyMismatches : undefined,
  })
}
