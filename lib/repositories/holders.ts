// Holders repository — household members + the M:N link to connections.
//
// `listForUser` returns ordered holder rows so the dashboard can render
// them in the user's chosen order. `getHolderIdsByConnection` returns a
// connectionId → holderId[] map; the dashboard service uses it to bucket
// each connection (0=unassigned, 1=personal, 2+=joint).

import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { connectionHolders, connections, db, holders, type Executor } from '@/lib/db/client'
import type { HolderRow } from '@/lib/db/schema'

export function listForUser(userId: string, executor: Executor = db): HolderRow[] {
  return executor
    .select()
    .from(holders)
    .where(eq(holders.userId, userId))
    .orderBy(asc(holders.displayOrder), asc(holders.createdAt))
    .all()
}

export function getById(id: string, executor: Executor = db): HolderRow | null {
  return executor.select().from(holders).where(eq(holders.id, id)).get() ?? null
}

// connectionId → array of holder ids that own it. Connections with no
// link rows are simply absent from the map (caller treats missing as
// "unassigned").
export function getHolderIdsByConnection(
  connectionIds: string[],
  executor: Executor = db,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (connectionIds.length === 0) return out
  const rows = executor
    .select()
    .from(connectionHolders)
    .where(inArray(connectionHolders.connectionId, connectionIds))
    .all()
  for (const r of rows) {
    const list = out.get(r.connectionId)
    if (list) list.push(r.holderId)
    else out.set(r.connectionId, [r.holderId])
  }
  return out
}

// Distinct holder ids referenced by any of the user's connections,
// sorted for stable iteration. Used by the snapshot rebuilder so holders
// with zero accounts still seed a flat line in the chart.
export function listLinkedIdsForUser(userId: string, executor: Executor = db): string[] {
  return executor
    .select({ id: sql<string>`${connectionHolders.holderId}` })
    .from(connectionHolders)
    .innerJoin(connections, eq(connectionHolders.connectionId, connections.id))
    .where(eq(connections.userId, userId))
    .all()
    .map((r) => r.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .sort()
}

export function create(
  input: {
    userId: string
    label: string
    color: string
    initials: string
  },
  executor: Executor = db,
): HolderRow {
  // displayOrder is computed from the current MAX inside the same
  // transaction so two concurrent creates can't pick the same slot.
  const writeAll = (tx: Executor): HolderRow => {
    const id = randomUUID()
    const maxRow = tx
      .select({ max: sql<number | null>`MAX(${holders.displayOrder})` })
      .from(holders)
      .where(eq(holders.userId, input.userId))
      .get()
    const nextOrder = (maxRow?.max ?? -1) + 1
    const row: HolderRow = {
      id,
      userId: input.userId,
      label: input.label,
      color: input.color,
      initials: input.initials,
      displayOrder: nextOrder,
      createdAt: Date.now(),
    }
    tx.insert(holders).values(row).run()
    return row
  }
  return executor === db ? db.transaction(writeAll) : writeAll(executor)
}

export function setForConnection(
  connectionId: string,
  holderIds: string[],
  executor: Executor = db,
): void {
  const writeAll = (tx: Executor) => {
    tx.delete(connectionHolders)
      .where(eq(connectionHolders.connectionId, connectionId))
      .run()
    for (const holderId of holderIds) {
      tx.insert(connectionHolders).values({ connectionId, holderId }).run()
    }
  }
  if (executor === db) {
    db.transaction(writeAll)
  } else {
    writeAll(executor)
  }
}
