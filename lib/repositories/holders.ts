// Holders repository — household members + the M:N link to connections.
//
// `listForUser` returns ordered holder rows so the dashboard can render
// them in the user's chosen order. `getHolderIdsByConnection` returns a
// connectionId → holderId[] map; the dashboard service uses it to bucket
// each connection (0=unassigned, 1=personal, 2+=joint).

import { randomUUID } from 'node:crypto'
import { asc, eq, inArray } from 'drizzle-orm'
import { connectionHolders, db, holders } from '@/lib/db/client'
import type { HolderRow } from '@/lib/db/schema'

export function listForUser(userId: string): HolderRow[] {
  return db
    .select()
    .from(holders)
    .where(eq(holders.userId, userId))
    .orderBy(asc(holders.displayOrder), asc(holders.createdAt))
    .all()
}

export function getById(id: string): HolderRow | null {
  return db.select().from(holders).where(eq(holders.id, id)).get() ?? null
}

// connectionId → array of holder ids that own it. Connections with no
// link rows are simply absent from the map (caller treats missing as
// "unassigned").
export function getHolderIdsByConnection(
  connectionIds: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (connectionIds.length === 0) return out
  const rows = db
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

export function create(input: {
  userId: string
  label: string
  color: string
  initials: string
}): HolderRow {
  const existing = listForUser(input.userId)
  const id = randomUUID()
  const row: HolderRow = {
    id,
    userId: input.userId,
    label: input.label,
    color: input.color,
    initials: input.initials,
    displayOrder: existing.length,
    createdAt: Date.now(),
  }
  db.insert(holders).values(row).run()
  return row
}

export function setForConnection(connectionId: string, holderIds: string[]): void {
  db.transaction((tx) => {
    tx.delete(connectionHolders)
      .where(eq(connectionHolders.connectionId, connectionId))
      .run()
    for (const holderId of holderIds) {
      tx.insert(connectionHolders).values({ connectionId, holderId }).run()
    }
  })
}
