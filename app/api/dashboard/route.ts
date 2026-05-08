// Thin controller: parse → call service → return JSON. No business logic
// here — see lib/services/dashboard.ts.

import { NextResponse } from 'next/server'
import { getDashboard } from '@/lib/services/dashboard'
import * as usersRepo from '@/lib/repositories/users'
import { getPeriodFromUrl } from '@/lib/api/validate'

export async function GET(req: Request) {
  const period = getPeriodFromUrl(new URL(req.url))

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
