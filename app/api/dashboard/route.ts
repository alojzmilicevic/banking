// Thin controller: parse → call service → return JSON. No business logic
// here — see lib/services/dashboard.ts.

import { NextResponse } from 'next/server'
import { getDashboard } from '@/lib/services/dashboard'
import { isPeriod, type Period } from '@/lib/services/timeseries'
import * as usersRepo from '@/lib/repositories/users'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const periodParam = url.searchParams.get('period') ?? '1Y'
  const period: Period = isPeriod(periodParam) ? periodParam : '1Y'

  const user = usersRepo.getDefault()
  if (!user) {
    return NextResponse.json({
      holders: [],
      shared: { total: 0, change: null, accounts: [] },
      unassigned: null,
      totals: { total: 0, cash: 0, investment: 0, change: null },
      baseCurrency: 'SEK',
      errors: [],
    })
  }
  return NextResponse.json(getDashboard(user.id, period))
}
