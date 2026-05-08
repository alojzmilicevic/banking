// Positions repository — drizzle queries only.

import { inArray } from 'drizzle-orm'
import { db, positions, type Executor } from '@/lib/db/client'
import type { Position } from '@/lib/db/schema'

export function listByAccountIds(
  accountIds: string[],
  executor: Executor = db,
): Pick<Position, 'accountId' | 'marketValue'>[] {
  if (accountIds.length === 0) return []
  return executor
    .select({ accountId: positions.accountId, marketValue: positions.marketValue })
    .from(positions)
    .where(inArray(positions.accountId, accountIds))
    .all()
}
