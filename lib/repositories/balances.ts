// Balances repository — drizzle queries only.

import { eq, inArray } from 'drizzle-orm'
import { balances, db, type Executor } from '@/lib/db/client'
import type { Balance } from '@/lib/db/schema'

export function listByAccountIds(accountIds: string[], executor: Executor = db): Balance[] {
  if (accountIds.length === 0) return []
  return executor.select().from(balances).where(inArray(balances.accountId, accountIds)).all()
}

export function listByAccountId(accountId: string, executor: Executor = db): Balance[] {
  return executor.select().from(balances).where(eq(balances.accountId, accountId)).all()
}
