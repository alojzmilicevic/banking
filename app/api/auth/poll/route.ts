import { NextResponse } from 'next/server'
import * as authStatesRepo from '@/lib/repositories/auth-states'
import * as connectionsRepo from '@/lib/repositories/connections'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/services/wealth'
import { PollAuthQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'

// GET /api/auth/poll?state=...
// Returns the same AuthChallenge shape as /api/auth/start. The frontend
// keeps polling on `kind: 'polling'` and stops on `complete` or `error`.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = validateQuery(url, PollAuthQuerySchema)
  if (!parsed.ok) {
    return NextResponse.json({ kind: 'error', message: 'state required' })
  }
  const { state } = parsed.data

  const row = authStatesRepo.getByState(state)
  if (!row) {
    return NextResponse.json({ kind: 'error', state, message: 'Unknown state' })
  }

  const provider = getProvider(row.providerId)
  if (!provider.pollAuth) {
    return NextResponse.json({
      kind: 'error',
      state,
      message: `${provider.name} doesn't support polling`,
    })
  }

  let payload: Record<string, unknown> = {}
  try {
    const decoded = JSON.parse(row.payload)
    if (decoded && typeof decoded === 'object') {
      payload = decoded as Record<string, unknown>
    }
  } catch {
    // Legacy / corrupt payload — fall through with an empty object so
    // pollAuth can still attempt the request.
  }

  const result = await provider.pollAuth({ state, payload })

  // When a poll completes, kick off the initial sync so the user has data
  // by the time they land on the home page. Don't fail the auth flow if
  // sync errors — persist the error onto the connection row so the
  // dashboard can surface it.
  if (result.kind === 'complete') {
    try {
      await syncConnection(result.connectionId)
    } catch (e) {
      console.error(`[poll] initial sync of ${result.connectionId} failed:`, e)
      try {
        const msg = e instanceof Error ? e.message : String(e)
        connectionsRepo.update(result.connectionId, { lastSyncError: `[initial] ${msg}` })
      } catch (persistErr) {
        console.error('[poll] could not persist initial sync error:', persistErr)
      }
    }
  }

  return NextResponse.json(result)
}
