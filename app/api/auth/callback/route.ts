import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { authStates, connections, db } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/sync/orchestrator'

// OAuth-style return URL (Enable Banking, future redirect-based providers).
// Polling-based providers (Avanza/BankID) never hit this endpoint — they
// finalize via /api/auth/poll instead.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  if (error) {
    return NextResponse.redirect(`${url.origin}/?error=${encodeURIComponent(errorDesc || error)}`)
  }
  if (!state) {
    return NextResponse.redirect(`${url.origin}/?error=missing_state`)
  }

  const pending = db.select().from(authStates).where(eq(authStates.state, state)).get()
  if (!pending) {
    return NextResponse.redirect(`${url.origin}/?error=unknown_state`)
  }

  // Single-use; clean up regardless of outcome.
  db.delete(authStates).where(eq(authStates.state, state)).run()

  try {
    const provider = getProvider(pending.providerId)
    if (!provider.completeAuth) {
      return NextResponse.redirect(
        `${url.origin}/?error=${encodeURIComponent(`${provider.name} has no callback flow`)}`,
      )
    }
    const completed = await provider.completeAuth({ state, code: code ?? undefined })

    const connectionId = randomUUID()
    db.insert(connections)
      .values({
        id: connectionId,
        userId: pending.userId,
        providerId: pending.providerId,
        externalId: completed.externalId,
        label: completed.label ?? null,
        status: 'active',
        validUntil: completed.validUntil ?? null,
        rawJson: JSON.stringify(completed.raw),
      })
      .run()

    try {
      await syncConnection(connectionId)
    } catch (e) {
      console.error('[callback] initial sync failed:', e)
    }

    return NextResponse.redirect(`${url.origin}/?connected=${connectionId}`)
  } catch (e) {
    return NextResponse.redirect(
      `${url.origin}/?error=${encodeURIComponent((e as Error).message)}`,
    )
  }
}
