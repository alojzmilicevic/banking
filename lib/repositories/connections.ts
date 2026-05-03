// Connections repository — drizzle queries only.
//
// Returns raw rows; the dashboard service handles bucketing/joint
// detection on top of these.

import { desc, eq } from 'drizzle-orm'
import { connections, db } from '@/lib/db/client'
import type { Connection } from '@/lib/db/schema'

export function listForUser(userId: string): Connection[] {
  return db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(desc(connections.createdAt))
    .all()
}

export function getById(id: string): Connection | null {
  return db.select().from(connections).where(eq(connections.id, id)).get() ?? null
}
