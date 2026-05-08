// daily_snapshots repository — drizzle queries only.

import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { dailySnapshots, db } from '@/lib/db/client'

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

export function upsertMany(rows: DailySnapshotUpsert[], now: number = Date.now()): void {
  if (rows.length === 0) return
  db.transaction((tx) => {
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
  })
}

export function getRange(
  userId: string,
  fromDate: string,
  toDate: string,
): SnapshotRangeRowRaw[] {
  return db
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

export function getEarliestDate(userId: string): string | null {
  const row = db
    .select({ date: sql<string>`MIN(${dailySnapshots.date})` })
    .from(dailySnapshots)
    .where(eq(dailySnapshots.userId, userId))
    .get()
  return row?.date ?? null
}
