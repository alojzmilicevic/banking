import { NextResponse } from 'next/server'
import * as usersRepo from '@/lib/repositories/users'
import { getTimeseries } from '@/lib/services/timeseries'
import { getPeriodFromUrl } from '@/lib/api/validate'

export async function GET(req: Request) {
  const period = getPeriodFromUrl(new URL(req.url))

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
