// One-shot post-migration backfill.
//
// The chart's read path now reads `account_daily_snapshots`, which is
// empty for any user whose data was last computed against the legacy
// `daily_snapshots` table. Calling `rebuildSnapshotsForUser` once per
// affected user populates the new table from current account state.
// After the next regular sync this becomes a no-op and the daily_snapshots
// table can be dropped in a follow-up migration.
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
