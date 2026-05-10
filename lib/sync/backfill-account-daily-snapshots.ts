// First-run backfill for `account_daily_snapshots`.
//
// Any user with accounts but no rows in the table gets a one-shot
// rebuild from current account state. Covers fresh DBs and edge cases
// where rows were cleared manually; after the next regular sync this
// becomes a no-op.
//
// Lives in lib/sync/ (not lib/db/) because it depends on the rebuild
// pipeline; lib/db/client.ts imports this module so the backfill runs
// after migrations on cold start.

import * as accountDailySnapshotsRepo from '@/lib/repositories/account-daily-snapshots'
import { rebuildSnapshotsForUser } from './snapshots'

export function backfillAccountDailySnapshotsIfEmpty(): {
  users: number
  rows: number
} {
  const userIds = accountDailySnapshotsRepo.listUsersNeedingBackfill()
  let rows = 0
  for (const uid of userIds) {
    const result = rebuildSnapshotsForUser(uid, { daysBack: 365 })
    rows += result.written
  }
  return { users: userIds.length, rows }
}
