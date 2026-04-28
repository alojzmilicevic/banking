import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { connections, db } from '@/lib/db/client'

// DELETE /api/connections/:id  → removes the connection (cascade-deletes
// accounts/balances/positions/transactions per FK rules in the schema).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = db.select().from(connections).where(eq(connections.id, id)).get()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  db.delete(connections).where(eq(connections.id, id)).run()
  return NextResponse.json({ removed: id })
}
