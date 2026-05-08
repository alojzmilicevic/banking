// account_value_history repository — drizzle queries only.

import { and, gte, inArray } from 'drizzle-orm'
import { accountValueHistory, db } from '@/lib/db/client'

export interface DailyValueRow {
  accountId: string
  date: string
  value: number
  growth: number | null
}

export function listByAccountIdsSince(
  accountIds: string[],
  sinceDate: string,
): DailyValueRow[] {
  if (accountIds.length === 0) return []
  return db
    .select({
      accountId: accountValueHistory.accountId,
      date: accountValueHistory.date,
      value: accountValueHistory.value,
      growth: accountValueHistory.growth,
    })
    .from(accountValueHistory)
    .where(
      and(
        inArray(accountValueHistory.accountId, accountIds),
        gte(accountValueHistory.date, sinceDate),
      ),
    )
    .all()
}
