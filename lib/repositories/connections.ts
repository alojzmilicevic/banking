// Connections repository — drizzle queries only.
//
// Returns raw rows; the dashboard service handles bucketing/joint
// detection on top of these.

import { and, desc, eq, sql } from 'drizzle-orm'
import { connectionHolders, connections, db, type Executor } from '@/lib/db/client'
import type { Connection } from '@/lib/db/schema'

export function listForUser(userId: string, executor: Executor = db): Connection[] {
  return executor
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(desc(connections.createdAt))
    .all()
}

export function listActiveForUser(userId: string, executor: Executor = db): Connection[] {
  return executor
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.status, 'active')))
    .all()
}

export function getById(id: string, executor: Executor = db): Connection | null {
  return executor.select().from(connections).where(eq(connections.id, id)).get() ?? null
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
//
// If the caller is already inside a transaction it can pass `tx` to fold
// the inserts into the outer one; otherwise we open a fresh transaction.
export function createWithHolder(
  input: CreateConnectionInput,
  holderId: string | null,
  executor: Executor = db,
): void {
  const writeAll = (tx: Executor) => {
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
  }
  if (executor === db) {
    db.transaction(writeAll)
  } else {
    writeAll(executor)
  }
}

export interface UpdateConnectionInput {
  status?: string
  validUntil?: number | null
  lastSyncedAt?: number | null
  lastSyncError?: string | null
  rawJson?: string | null
}

export function update(
  id: string,
  patch: UpdateConnectionInput,
  executor: Executor = db,
): void {
  executor.update(connections).set(patch).where(eq(connections.id, id)).run()
}

export function deleteById(id: string, executor: Executor = db): void {
  executor.delete(connections).where(eq(connections.id, id)).run()
}

// Avanza re-link match: looks for an existing (user, avanza, holder)
// connection so refreshing credentials reuses the row instead of
// creating a duplicate. holderId=null matches connections with no holder
// links; a holder uuid matches the specific link in connection_holders.
export function findIdByUserProviderAndHolder(
  userId: string,
  providerId: string,
  holderId: string | null,
  executor: Executor = db,
): string | null {
  if (holderId !== null) {
    // Connection with a matching link row. One JOIN, one round-trip.
    const row = executor
      .select({ id: connections.id })
      .from(connections)
      .innerJoin(connectionHolders, eq(connectionHolders.connectionId, connections.id))
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.providerId, providerId),
          eq(connectionHolders.holderId, holderId),
        ),
      )
      .get()
    return row?.id ?? null
  }

  // Unassigned: a connection with no matching connection_holders row.
  // SQLite supports the `NOT EXISTS` correlated subquery via drizzle's
  // `sql` raw escape, but a single LEFT JOIN with `IS NULL` is simpler
  // and works the same.
  const row = executor
    .select({ id: connections.id })
    .from(connections)
    .leftJoin(connectionHolders, eq(connectionHolders.connectionId, connections.id))
    .where(
      and(
        eq(connections.userId, userId),
        eq(connections.providerId, providerId),
        sql`${connectionHolders.connectionId} IS NULL`,
      ),
    )
    .get()
  return row?.id ?? null
}
