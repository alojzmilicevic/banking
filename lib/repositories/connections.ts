// Connections repository — drizzle queries only.
//
// Returns raw rows; the dashboard service handles bucketing/joint
// detection on top of these.

import { and, desc, eq, inArray } from 'drizzle-orm'
import { connectionHolders, connections, db } from '@/lib/db/client'
import type { Connection } from '@/lib/db/schema'

export function listForUser(userId: string): Connection[] {
  return db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(desc(connections.createdAt))
    .all()
}

export function listActiveForUser(userId: string): Connection[] {
  return db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.status, 'active')))
    .all()
}

export function getById(id: string): Connection | null {
  return db.select().from(connections).where(eq(connections.id, id)).get() ?? null
}

export interface CreateConnectionInput {
  id: string
  userId: string
  providerId: string
  externalId: string
  label: string | null
  status?: string
  validUntil?: number | null
  rawJson?: string | null
  createdAt?: number
}

// Create a connection and (optionally) link it to a holder atomically.
// Used by the EB callback and Avanza first-link flows — both insert a
// connection plus, when a holderId was supplied at /api/auth/start, the
// matching connection_holders row.
export function createWithHolder(
  input: CreateConnectionInput,
  holderId: string | null,
): void {
  db.transaction((tx) => {
    tx.insert(connections)
      .values({
        id: input.id,
        userId: input.userId,
        providerId: input.providerId,
        externalId: input.externalId,
        label: input.label,
        status: input.status ?? 'active',
        validUntil: input.validUntil ?? null,
        rawJson: input.rawJson ?? null,
        ...(input.createdAt != null ? { createdAt: input.createdAt } : {}),
      })
      .run()
    if (holderId) {
      tx.insert(connectionHolders).values({ connectionId: input.id, holderId }).run()
    }
  })
}

export interface UpdateConnectionInput {
  status?: string
  validUntil?: number | null
  lastSyncedAt?: number | null
  lastSyncError?: string | null
  rawJson?: string | null
}

export function update(id: string, patch: UpdateConnectionInput): void {
  db.update(connections).set(patch).where(eq(connections.id, id)).run()
}

export function deleteById(id: string): void {
  db.delete(connections).where(eq(connections.id, id)).run()
}

// Avanza re-link match: looks for an existing (user, avanza, holder)
// connection so refreshing credentials reuses the row instead of
// creating a duplicate. holderId=null matches connections with no holder
// links; a holder uuid matches the specific link in connection_holders.
export function findIdByUserProviderAndHolder(
  userId: string,
  providerId: string,
  holderId: string | null,
): string | null {
  const rows = db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.providerId, providerId)))
    .all()
  if (rows.length === 0) return null

  const ids = rows.map((r) => r.id)

  if (holderId === null) {
    const linked = db
      .select({ connectionId: connectionHolders.connectionId })
      .from(connectionHolders)
      .where(inArray(connectionHolders.connectionId, ids))
      .all()
    const linkedSet = new Set(linked.map((l) => l.connectionId))
    return rows.find((r) => !linkedSet.has(r.id))?.id ?? null
  }

  const link = db
    .select({ connectionId: connectionHolders.connectionId })
    .from(connectionHolders)
    .where(
      and(
        inArray(connectionHolders.connectionId, ids),
        eq(connectionHolders.holderId, holderId),
      ),
    )
    .get()
  return link?.connectionId ?? null
}
