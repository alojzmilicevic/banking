// Balances repository — drizzle queries only.

import { inArray } from 'drizzle-orm'
import { balances, db } from '@/lib/db/client'
import type { Balance } from '@/lib/db/schema'

export function listByAccountIds(accountIds: string[]): Balance[] {
  if (accountIds.length === 0) return []
  return db.select().from(balances).where(inArray(balances.accountId, accountIds)).all()
}
