import { NextResponse } from 'next/server'
import * as usersRepo from '@/lib/repositories/users'
import { getTimeseries, isPeriod, type Period } from '@/lib/services/timeseries'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const periodParam = url.searchParams.get('period') ?? '1Y'
  const period: Period = isPeriod(periodParam) ? periodParam : '1Y'

  const user = usersRepo.getDefault()
  if (!user) {
    return NextResponse.json({
      series: [],
      current: { total: 0, cash: 0, investment: 0, byHolder: {}, shared: 0, unassigned: 0 },
      currency: null,
      period,
      points: 0,
      errors: [],
    })
  }
  return NextResponse.json(getTimeseries(user.id, period))
}
