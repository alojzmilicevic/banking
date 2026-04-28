import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { authStates, db } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/sync/orchestrator'

// GET /api/auth/poll?state=...
// Returns the same AuthChallenge shape as /api/auth/start. The frontend
// keeps polling on `kind: 'polling'` and stops on `complete` or `error`.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  if (!state) {
    return NextResponse.json({ kind: 'error', message: 'state required' })
  }

  const row = db.select().from(authStates).where(eq(authStates.state, state)).get()
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

  const result = await provider.pollAuth({ state, payload: JSON.parse(row.payload) })

  // When a poll completes, kick off the initial sync so the user has data
  // by the time they land on the home page. Don't fail the auth flow if
  // sync errors — they can hit Refresh.
  if (result.kind === 'complete') {
    try {
      await syncConnection(result.connectionId)
    } catch (e) {
      console.error(`[poll] initial sync of ${result.connectionId} failed:`, e)
    }
  }

  return NextResponse.json(result)
}
