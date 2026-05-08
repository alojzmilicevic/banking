// daily_snapshots repository — drizzle queries only.

import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { dailySnapshots, db, type Executor } from '@/lib/db/client'

export interface DailySnapshotUpsert {
  userId: string
  date: string
  baseCurrency: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  detailJson: string
}

export interface SnapshotRangeRowRaw {
  date: string
  totalAmount: number
  cashAmount: number
  investmentAmount: number
  detailJson: string
}

// Bulk upsert. When the caller is already running inside a transaction
// they can pass `tx` and the rows are written in-line (no nested
// transaction); otherwise we open a fresh one ourselves.
export function upsertMany(
  rows: DailySnapshotUpsert[],
  now: number = Date.now(),
  executor: Executor = db,
): void {
  if (rows.length === 0) return
  const writeAll = (tx: Executor) => {
    for (const r of rows) {
      tx.insert(dailySnapshots)
        .values({
          userId: r.userId,
          date: r.date,
          baseCurrency: r.baseCurrency,
          totalAmount: r.totalAmount,
          cashAmount: r.cashAmount,
          investmentAmount: r.investmentAmount,
          detailJson: r.detailJson,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [dailySnapshots.userId, dailySnapshots.date],
          set: {
            baseCurrency: r.baseCurrency,
            totalAmount: r.totalAmount,
            cashAmount: r.cashAmount,
            investmentAmount: r.investmentAmount,
            detailJson: r.detailJson,
            computedAt: now,
          },
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

export function getRange(
  userId: string,
  fromDate: string,
  toDate: string,
  executor: Executor = db,
): SnapshotRangeRowRaw[] {
  return executor
    .select({
      date: dailySnapshots.date,
      totalAmount: dailySnapshots.totalAmount,
      cashAmount: dailySnapshots.cashAmount,
      investmentAmount: dailySnapshots.investmentAmount,
      detailJson: dailySnapshots.detailJson,
    })
    .from(dailySnapshots)
    .where(
      and(
        eq(dailySnapshots.userId, userId),
        gte(dailySnapshots.date, fromDate),
        lte(dailySnapshots.date, toDate),
      ),
    )
    .orderBy(dailySnapshots.date)
    .all()
}

export function getEarliestDate(userId: string, executor: Executor = db): string | null {
  const row = executor
    .select({ date: sql<string>`MIN(${dailySnapshots.date})` })
    .from(dailySnapshots)
    .where(eq(dailySnapshots.userId, userId))
    .get()
  return row?.date ?? null
}
