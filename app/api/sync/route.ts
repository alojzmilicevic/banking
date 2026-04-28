import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { connections, db, users } from '@/lib/db/client'
import { syncConnection, type SyncMode } from '@/lib/sync/orchestrator'

// POST /api/sync         → sync all active connections for the default user
// POST /api/sync?id=...  → sync one connection
// POST /api/sync?mode=force-full  → force initial 365d backfill

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const mode = (searchParams.get('mode') ?? 'auto') as SyncMode

  try {
    if (id) {
      const result = await syncConnection(id, { mode })
      return NextResponse.json({ results: [result] })
    }

    const user = db.select().from(users).get()
    if (!user) {
      return NextResponse.json({ results: [] })
    }
    const conns = db
      .select()
      .from(connections)
      .where(eq(connections.userId, user.id))
      .all()
    const active = conns.filter((c) => c.status === 'active')

    const results = await Promise.all(active.map((c) => syncConnection(c.id, { mode })))
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
