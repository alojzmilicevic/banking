// Smoke-test getTimeseries() across all periods. Prints the current
// totals + first/last point per period so we can eyeball the new shape.
//
// Run with: npx tsx scripts/verify-timeseries.ts

import { getTimeseries, isPeriod } from '../lib/services/timeseries'
import * as usersRepo from '../lib/repositories/users'

const user = usersRepo.getDefault()
if (!user) {
  console.log('No users in DB.')
  process.exit(0)
}

for (const p of ['1W', '1M', '3M', '1Y', 'ALL']) {
  if (!isPeriod(p)) continue
  const r = getTimeseries(user.id, p)
  console.log(`\n[${p}] points=${r.points}  currency=${r.currency}`)
  console.log(`  current.total=${r.current.total}  shared=${r.current.shared}  unassigned=${r.current.unassigned}`)
  console.log(`  current.byHolder=`, r.current.byHolder)
  if (r.series.length > 0) {
    const f = r.series[0]
    const l = r.series[r.series.length - 1]
    console.log(`  series[0]:    ${f.date}  total=${f.total}  byHolder=`, f.byHolder)
    console.log(`  series[last]: ${l.date}  total=${l.total}  byHolder=`, l.byHolder)
  }
}

console.log()
