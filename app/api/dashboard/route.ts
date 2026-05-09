// Thin controller: parse → call service → return JSON. No business logic
// here — see lib/services/dashboard.ts.

import { NextResponse } from 'next/server'
import { getDashboard, getEmptyDashboard } from '@/lib/services/dashboard'
import * as usersRepo from '@/lib/repositories/users'
import { getPeriodFromUrl } from '@/lib/api/validate'

export async function GET(req: Request) {
  const period = getPeriodFromUrl(new URL(req.url))
  const user = usersRepo.getDefault()
  if (!user) return NextResponse.json(getEmptyDashboard())
  return NextResponse.json(getDashboard(user.id, period))
}
