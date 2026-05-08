import { NextResponse } from 'next/server'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as usersRepo from '@/lib/repositories/users'
import { syncConnection, type SyncOutcome } from '@/lib/services/wealth'
import { rateLimit } from '@/lib/sync/rate-limit'
import { SyncQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'

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

// Single envelope for both single and bulk sync responses. `outcome` is
// non-null on success; `error` is non-null on failure or rate-limit.
interface SyncResult {
  connectionId: string
  outcome: SyncOutcome | null
  error: string | null
}

function ownershipError(connectionId: string, msg: string): SyncResult {
  return { connectionId, outcome: null, error: msg }
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const parsedQuery = validateQuery(url, SyncQuerySchema)
  if (!parsedQuery.ok) return parsedQuery.response
  const { id, mode } = parsedQuery.data

  // Sync is a per-user operation — no user means nothing to do (and
  // rate-limiting an "anon" bucket would let unauth callers exhaust the
  // shared key for the real user).
  const user = usersRepo.getDefault()
  if (!user) {
    return NextResponse.json({ error: 'No user' }, { status: 401 })
  }

  try {
    if (id) {
      const conn = connectionsRepo.getById(id)
      if (!conn || conn.userId !== user.id) {
        return NextResponse.json({ error: 'connection not found' }, { status: 404 })
      }
      const r = rateLimit(rateKey(user.id, conn.providerId), RATE_CAPACITY, RATE_REFILL_MS)
      if (!r.allowed) {
        return NextResponse.json(
          { error: 'Rate limited', retryAfter: r.retryAfterSec },
          { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
        )
      }
      try {
        const outcome = await syncConnection(id, { mode })
        return NextResponse.json({
          results: [{ connectionId: id, outcome, error: null } satisfies SyncResult],
        })
      } catch (e) {
        return NextResponse.json(
          {
            results: [
              ownershipError(id, e instanceof Error ? e.message : String(e)),
            ],
          },
          { status: 207 },
        )
      }
    }

    const active = connectionsRepo.listActiveForUser(user.id)

    // Per-connection rate-limit check using its provider's bucket. Rate-
    // limited connections short-circuit with a 429-shaped result; the
    // others still proceed in parallel.
    const limited: SyncResult[] = []
    const allowed: typeof active = []
    for (const c of active) {
      const r = rateLimit(rateKey(user.id, c.providerId), RATE_CAPACITY, RATE_REFILL_MS)
      if (r.allowed) allowed.push(c)
      else limited.push(ownershipError(c.id, `Rate limited (retry in ${r.retryAfterSec}s)`))
    }

    const settled = await Promise.allSettled(allowed.map((c) => syncConnection(c.id, { mode })))
    const ranResults: SyncResult[] = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { connectionId: allowed[i].id, outcome: r.value, error: null }
        : {
            connectionId: allowed[i].id,
            outcome: null,
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
