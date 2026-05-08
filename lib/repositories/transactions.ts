// Transactions repository — drizzle queries only.

import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm'
import { db, transactions } from '@/lib/db/client'
import type { Transaction } from '@/lib/db/schema'

export function listByAccountId(accountId: string): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(desc(transactions.date))
    .all()
}

export interface BookedTxRow {
  accountId: string
  date: string
  amount: number
  kind: string | null
}

// Walkback feed for the snapshot rebuilder. Filters out pending/info
// statuses, restricts to a date floor, and orders by date desc — the
// rebuilder relies on that ordering to walk amounts back day by day.
export function listBookedSinceForAccountIds(
  accountIds: string[],
  sinceDate: string,
): BookedTxRow[] {
  if (accountIds.length === 0) return []
  return db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        gte(transactions.date, sinceDate),
        ne(transactions.status, 'PDNG'),
        ne(transactions.status, 'INFO'),
      ),
    )
    .orderBy(desc(transactions.date))
    .all()
}
