import { NextResponse } from 'next/server'
import { db, users } from '@/lib/db/client'
import {
  computeTodaySnapshot,
  getEarliestSnapshotDate,
  getSnapshotsRange,
} from '@/lib/sync/snapshots'

const MS_DAY = 86400_000

const PERIODS = ['1W', '1M', '3M', '1Y', 'ALL'] as const
type Period = (typeof PERIODS)[number]

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function periodFromDate(period: Period, today: Date, userId: string): string {
  const t = new Date(today)
  t.setUTCHours(0, 0, 0, 0)
  switch (period) {
    case '1W':
      return isoDay(new Date(t.getTime() - 7 * MS_DAY))
    case '1M':
      return isoDay(new Date(t.getTime() - 30 * MS_DAY))
    case '3M':
      return isoDay(new Date(t.getTime() - 90 * MS_DAY))
    case '1Y':
      return isoDay(new Date(t.getTime() - 365 * MS_DAY))
    case 'ALL':
    default:
      return getEarliestSnapshotDate(userId) ?? isoDay(t)
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
    return NextResponse.json({ series: [], currency: null, points: 0, period })
  }

  const today = computeTodaySnapshot(user.id)
  const fromIso = periodFromDate(period, new Date(), user.id)
  const snaps = getSnapshotsRange(user.id, fromIso, today.date)

  // Each point carries combined + per-holder breakdown so the chart can
  // render multiple lines (Combined / Alojz / Alma / Shared) without a
  // second round-trip.
  const series = snaps.length
    ? snaps.map((s) => ({
        date: s.date,
        total: s.totalAmount,
        cash: s.cashAmount,
        investments: s.investmentAmount,
        alma: s.byHolder.alma,
        alojz: s.byHolder.alojz,
        joint: s.byHolder.joint,
      }))
    : [
        {
          date: today.date,
          total: today.totalAmount,
          cash: today.cashAmount,
          investments: today.investmentAmount,
          alma: today.byHolder.alma,
          alojz: today.byHolder.alojz,
          joint: today.byHolder.joint,
        },
      ]

  return NextResponse.json({
    series,
    currency: today.baseCurrency,
    period,
    points: series.length,
    cashTotal: today.cashAmount,
    investmentTotal: today.investmentAmount,
    almaTotal: today.byHolder.alma,
    alojzTotal: today.byHolder.alojz,
    jointTotal: today.byHolder.joint,
    errors: today.currencyMismatches.length ? today.currencyMismatches : undefined,
  })
}
