// Balances repository — drizzle queries only.

import { eq, inArray } from 'drizzle-orm'
import { balances, db } from '@/lib/db/client'
import type { Balance } from '@/lib/db/schema'

export function listByAccountIds(accountIds: string[]): Balance[] {
  if (accountIds.length === 0) return []
  return db.select().from(balances).where(inArray(balances.accountId, accountIds)).all()
}

export function listByAccountId(accountId: string): Balance[] {
  return db.select().from(balances).where(eq(balances.accountId, accountId)).all()
}
