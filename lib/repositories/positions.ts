// Positions repository — drizzle queries only.

import { inArray } from 'drizzle-orm'
import { db, positions } from '@/lib/db/client'
import type { Position } from '@/lib/db/schema'

export function listByAccountIds(
  accountIds: string[],
): Pick<Position, 'accountId' | 'marketValue'>[] {
  if (accountIds.length === 0) return []
  return db
    .select({ accountId: positions.accountId, marketValue: positions.marketValue })
    .from(positions)
    .where(inArray(positions.accountId, accountIds))
    .all()
}
