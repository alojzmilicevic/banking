import { NextResponse } from 'next/server'
import * as usersRepo from '@/lib/repositories/users'
import { getEmptyTimeseries, getTimeseries } from '@/lib/services/timeseries'
import { getPeriodFromUrl } from '@/lib/api/validate'

export async function GET(req: Request) {
  const period = getPeriodFromUrl(new URL(req.url))
  const user = usersRepo.getDefault()
  if (!user) return NextResponse.json(getEmptyTimeseries(period))
  return NextResponse.json(getTimeseries(user.id, period))
}
