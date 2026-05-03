// Accounts repository — drizzle queries only.

import { eq, inArray } from 'drizzle-orm'
import { accounts, db } from '@/lib/db/client'
import type { Account } from '@/lib/db/schema'

export function listByConnectionIds(connectionIds: string[]): Account[] {
  if (connectionIds.length === 0) return []
  return db.select().from(accounts).where(inArray(accounts.connectionId, connectionIds)).all()
}

export function getById(id: string): Account | null {
  return db.select().from(accounts).where(eq(accounts.id, id)).get() ?? null
}
