import { NextResponse } from 'next/server'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as usersRepo from '@/lib/repositories/users'
import { syncConnection, type SyncMode } from '@/lib/services/wealth'
import { rateLimit } from '@/lib/sync/rate-limit'

// POST /api/sync                  → sync all active connections
// POST /api/sync?id=<connId>      → sync one connection
// POST /api/sync?mode=force-full  → force initial 365d backfill
//
// Rate limited per (user × provider): 10 syncs / minute / provider. One
// provider hitting limits cannot block the others. 207 Multi-Status when
// at least one connection failed; 200 only on full success.

const RATE_CAPACITY = 10
const RATE_REFILL_MS = 60_000 / RATE_CAPACITY

function rateKey(userId: string, providerId: string) {
  return `sync:${providerId}:${userId}`
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const mode = (searchParams.get('mode') ?? 'auto') as SyncMode

  try {
    const user = usersRepo.getDefault()
    const userId = user?.id ?? 'anon'

    if (id) {
      const conn = connectionsRepo.getById(id)
      if (!conn) {
        return NextResponse.json({ error: 'connection not found' }, { status: 404 })
      }
      const r = rateLimit(rateKey(userId, conn.providerId), RATE_CAPACITY, RATE_REFILL_MS)
      if (!r.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfter: r.retryAfterSec },
          { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
        )
      }
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

    const active = connectionsRepo.listActiveForUser(user.id)

    // Per-connection rate-limit check using its provider's bucket. Rate-
    // limited connections short-circuit with a 429-shaped result; the
    // others still proceed in parallel.
    type Result = { connectionId: string; outcome?: unknown; error?: string }
    const limited: Result[] = []
    const allowed: typeof active = []
    for (const c of active) {
      const r = rateLimit(rateKey(user.id, c.providerId), RATE_CAPACITY, RATE_REFILL_MS)
      if (r.allowed) allowed.push(c)
      else limited.push({ connectionId: c.id, error: `Rate limited (retry in ${r.retryAfterSec}s)` })
    }

    const settled = await Promise.allSettled(allowed.map((c) => syncConnection(c.id, { mode })))
    const ranResults: Result[] = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { connectionId: allowed[i].id, outcome: r.value }
        : {
            connectionId: allowed[i].id,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
    )
    const results = [...ranResults, ...limited]
    const anyFailed = results.some((r) => r.error)
    return NextResponse.json({ results }, { status: anyFailed ? 207 : 200 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
