// One-time: rewrites daily_snapshots.detail_json from the legacy
// {byHolder: {alma, alojz, joint, unassigned}} shape to the current
// {byHolder: {[holderId]: n}, sharedAmount, unassignedAmount} shape.
//
// Maps legacy keys → deterministic holder ids set up by migration 0007:
//   'alojz' → '{userId}:a'
//   'alma'  → '{userId}:b'
//   'joint' → folded into sharedAmount
//   'unassigned' → folded into unassignedAmount
//
// Idempotent — re-running finds no rows with legacy keys and exits.
// Safe to delete this script once it has been run on every environment.
//
// Run with: npx tsx scripts/migrate-snapshot-keys.ts

import { and, eq, sql } from 'drizzle-orm'
import { dailySnapshots, db, holders } from '../lib/db/client'

const rows = db
  .select({
    userId: dailySnapshots.userId,
    date: dailySnapshots.date,
    detailJson: dailySnapshots.detailJson,
  })
  .from(dailySnapshots)
  .where(
    sql`detail_json LIKE '%"alma"%' OR detail_json LIKE '%"alojz"%' OR detail_json LIKE '%"joint"%' OR detail_json LIKE '%"unassigned"%'`,
  )
  .all()

if (rows.length === 0) {
  console.log('No legacy snapshot rows — nothing to do.')
  process.exit(0)
}

console.log(`Rewriting ${rows.length} snapshot row(s)…`)

// Cache the holder id lookup per user so we don't query for every row.
const holderIdByUser = new Map<string, { a: string | null; b: string | null }>()

function lookup(userId: string): { a: string | null; b: string | null } {
  let cached = holderIdByUser.get(userId)
  if (cached) return cached
  const userHolders = db.select().from(holders).where(eq(holders.userId, userId)).all()
  cached = {
    a: userHolders.find((h) => h.id === `${userId}:a`)?.id ?? null,
    b: userHolders.find((h) => h.id === `${userId}:b`)?.id ?? null,
  }
  holderIdByUser.set(userId, cached)
  return cached
}

let written = 0
db.transaction((tx) => {
  for (const r of rows) {
    const ids = lookup(r.userId)
    const parsed = JSON.parse(r.detailJson) as {
      byHolder?: Record<string, number>
      sharedAmount?: number
      unassignedAmount?: number
    }
    const src = parsed.byHolder ?? {}
    const newByHolder: Record<string, number> = {}
    let shared = parsed.sharedAmount ?? 0
    let unassigned = parsed.unassignedAmount ?? 0

    for (const [k, v] of Object.entries(src)) {
      if (k === 'alojz' && ids.a) newByHolder[ids.a] = (newByHolder[ids.a] ?? 0) + v
      else if (k === 'alma' && ids.b) newByHolder[ids.b] = (newByHolder[ids.b] ?? 0) + v
      else if (k === 'joint') shared += v
      else if (k === 'unassigned') unassigned += v
      else newByHolder[k] = (newByHolder[k] ?? 0) + v // already a uuid
    }

    const newDetail = JSON.stringify({
      byHolder: newByHolder,
      sharedAmount: shared,
      unassignedAmount: unassigned,
    })
    tx.update(dailySnapshots)
      .set({ detailJson: newDetail })
      .where(and(eq(dailySnapshots.userId, r.userId), eq(dailySnapshots.date, r.date)))
      .run()
    written++
  }
})

console.log(`Done. Updated ${written} row(s).`)
