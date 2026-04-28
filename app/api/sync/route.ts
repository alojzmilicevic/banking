import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { connections, db, users } from '@/lib/db/client'
import { syncConnection, type SyncMode } from '@/lib/sync/orchestrator'
import { rateLimit } from '@/lib/sync/rate-limit'

// POST /api/sync                  → sync all active connections
// POST /api/sync?id=<connId>      → sync one connection
// POST /api/sync?mode=force-full  → force initial 365d backfill
//
// Rate limited per user: 10 syncs / minute. 207 Multi-Status when at
// least one connection failed; 200 only on full success.

const RATE_CAPACITY = 10
const RATE_REFILL_MS = 60_000 / RATE_CAPACITY

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const mode = (searchParams.get('mode') ?? 'auto') as SyncMode

  try {
    const user = db.select().from(users).get()
    const rateKey = `sync:${user?.id ?? 'anon'}`
    const r = rateLimit(rateKey, RATE_CAPACITY, RATE_REFILL_MS)
    if (!r.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limited',
          retryAfter: r.retryAfterSec,
        },
        { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
      )
    }

    if (id) {
      try {
        const outcome = await syncConnection(id, { mode })
        return NextResponse.json({ results: [{ connectionId: id, outcome }] })
      } catch (e) {
        return NextResponse.json(
          { results: [{ connectionId: id, error: (e as Error).message }] },
          { status: 207 },
        )
      }
    }

    if (!user) return NextResponse.json({ results: [] })

    const conns = db
      .select()
      .from(connections)
      .where(eq(connections.userId, user.id))
      .all()
    const active = conns.filter((c) => c.status === 'active')

    const settled = await Promise.allSettled(active.map((c) => syncConnection(c.id, { mode })))
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { connectionId: active[i].id, outcome: r.value }
        : {
            connectionId: active[i].id,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
    )
    const anyFailed = results.some((r) => 'error' in r && r.error)
    return NextResponse.json({ results }, { status: anyFailed ? 207 : 200 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
