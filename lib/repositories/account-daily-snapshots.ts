// account_daily_snapshots repository — drizzle queries only.
//
// Per-account-per-day storage that lets the chart aggregate at read time
// while applying the live `accounts.excluded_from_total` filter. This is
// what makes toggling an account's "include in totals" flag an O(1)
// UPDATE instead of a 365-day rebuild.

import { and, eq, gte, lte } from 'drizzle-orm'
import {
  accountDailySnapshots,
  accounts,
  connections,
  db,
  type Executor,
} from '@/lib/db/client'

export interface AccountDailySnapshotUpsert {
  userId: string
  accountId: string
  date: string
  amount: number
  kind: string | null
  holderBucket: string
}

export interface AccountDailySnapshotRangeRow {
  date: string
  accountId: string
  amount: number
  kind: string | null
  holderBucket: string
  excludedFromTotal: number
}

// Replace every row for the given user atomically. The rebuilder always
// recomputes the full window, so a delete+insert is simpler (and faster
// in practice) than per-row upserts: it sidesteps the case where a
// removed account leaves stale rows behind.
export function replaceForUser(
  userId: string,
  rows: AccountDailySnapshotUpsert[],
  now: number = Date.now(),
  executor: Executor = db,
): void {
  const writeAll = (tx: Executor) => {
    tx.delete(accountDailySnapshots).where(eq(accountDailySnapshots.userId, userId)).run()
    if (rows.length === 0) return
    for (const r of rows) {
      tx.insert(accountDailySnapshots)
        .values({
          userId: r.userId,
          accountId: r.accountId,
          date: r.date,
          amount: r.amount,
          kind: r.kind,
          holderBucket: r.holderBucket,
          computedAt: now,
        })
        .run()
    }
  }
  if (executor === db) {
    db.transaction(writeAll)
  } else {
    writeAll(executor)
  }
}

// Range read joined with `accounts.excluded_from_total` so the caller
// can drop currently-excluded accounts on the fly. Without the join the
// caller would need a second query to learn which account ids are
// excluded — easy to forget, and racy.
export function getRangeForUser(
  userId: string,
  fromDate: string,
  toDate: string,
  executor: Executor = db,
): AccountDailySnapshotRangeRow[] {
  return executor
    .select({
      date: accountDailySnapshots.date,
      accountId: accountDailySnapshots.accountId,
      amount: accountDailySnapshots.amount,
      kind: accountDailySnapshots.kind,
      holderBucket: accountDailySnapshots.holderBucket,
      excludedFromTotal: accounts.excludedFromTotal,
    })
    .from(accountDailySnapshots)
    .innerJoin(accounts, eq(accounts.id, accountDailySnapshots.accountId))
    .where(
      and(
        eq(accountDailySnapshots.userId, userId),
        gte(accountDailySnapshots.date, fromDate),
        lte(accountDailySnapshots.date, toDate),
      ),
    )
    .orderBy(accountDailySnapshots.date)
    .all()
}

export function getEarliestDateForUser(
  userId: string,
  executor: Executor = db,
): string | null {
  const row = executor
    .select({ date: accountDailySnapshots.date })
    .from(accountDailySnapshots)
    .innerJoin(accounts, eq(accounts.id, accountDailySnapshots.accountId))
    .where(and(eq(accountDailySnapshots.userId, userId), eq(accounts.excludedFromTotal, 0)))
    .orderBy(accountDailySnapshots.date)
    .limit(1)
    .get()
  return row?.date ?? null
}

export function hasAnyForUser(userId: string, executor: Executor = db): boolean {
  const row = executor
    .select({ accountId: accountDailySnapshots.accountId })
    .from(accountDailySnapshots)
    .where(eq(accountDailySnapshots.userId, userId))
    .limit(1)
    .get()
  return row !== undefined
}

// Users that have at least one account but no rows yet — drives the
// post-migration backfill. The list comes from `connections.user_id`
// since accounts join through connections.
export function listUsersNeedingBackfill(executor: Executor = db): string[] {
  const usersWithAccounts = executor
    .selectDistinct({ userId: connections.userId })
    .from(connections)
    .innerJoin(accounts, eq(accounts.connectionId, connections.id))
    .all()
    .map((r) => r.userId)
  return usersWithAccounts.filter((uid) => !hasAnyForUser(uid, executor))
}
