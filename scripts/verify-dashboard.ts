// Calls getDashboard() directly so we can eyeball the shape without
// booting Next.js. Prints a compact summary; pipe through `jq` for full
// JSON if needed.
//
// Run with: npx tsx scripts/verify-dashboard.ts

import { getDashboard } from '../lib/services/dashboard'
import * as usersRepo from '../lib/repositories/users'

const user = usersRepo.getDefault()
if (!user) {
  console.log('No users in DB — nothing to dashboard.')
  process.exit(0)
}

const d = getDashboard(user.id)

console.log(`\nHolders (${d.holders.length}):`)
for (const h of d.holders) {
  const change = h.change ? ` (Δ: ${h.change.absolute >= 0 ? '+' : ''}${h.change.absolute})` : ''
  console.log(`  ${h.label.padEnd(8)}  total=${h.total}${change}  accounts=${h.accounts.length}`)
}

console.log(`\nShared:  total=${d.shared.total}  accounts=${d.shared.accounts.length}`)
console.log(`Unassigned: ${d.unassigned ? `total=${d.unassigned.total} accounts=${d.unassigned.accounts.length}` : 'none'}`)
console.log(
  `\nTotals: total=${d.totals.total}  cash=${d.totals.cash}  investment=${d.totals.investment}` +
    (d.totals.change ? `  Δ=${d.totals.change.absolute}` : ''),
)

console.log(`\nBucket distribution by account:`)
const allAccs = [
  ...d.holders.flatMap((h) => h.accounts.map((a) => ({ a, where: h.label }))),
  ...d.shared.accounts.map((a) => ({ a, where: 'shared' })),
  ...(d.unassigned?.accounts.map((a) => ({ a, where: 'unassigned' })) ?? []),
]
for (const { a, where } of allAccs) {
  const dupe = a.possibleDuplicateOf ? ' [dupe]' : ''
  const hidden = a.excludedFromTotal ? ' [hidden]' : ''
  const label = a.details || a.product || a.name || a.id.slice(0, 8)
  console.log(`  [${where.padEnd(10)}] ${label.padEnd(40)} bal=${a.balance ?? '-'}${dupe}${hidden}`)
}

console.log()
