// Transactions repository — drizzle queries only.

import { desc, eq } from 'drizzle-orm'
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
