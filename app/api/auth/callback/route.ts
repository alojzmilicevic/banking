import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { authStates, connections, db } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/sync/orchestrator'
import { AuthCallbackQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'

// OAuth-style return URL (Enable Banking, future redirect-based providers).
// Cookie-based providers (Avanza) never hit this endpoint — they create
// the connection synchronously in /api/auth/start.

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = validateQuery(url, AuthCallbackQuerySchema)
  if (!parsed.ok) {
    return NextResponse.redirect(`${url.origin}/?error=invalid_callback_query`)
  }
  const { code, state, error, error_description: errorDesc } = parsed.data

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

    let holder: 'alma' | 'alojz' | 'joint' | null = null
    try {
      const parsedPayload = JSON.parse(pending.payload) as { holder?: string }
      const h = parsedPayload.holder
      if (h === 'alma' || h === 'alojz' || h === 'joint') holder = h
    } catch {
      // Legacy / malformed payload — leave holder unset.
    }

    const connectionId = randomUUID()
    db.insert(connections)
      .values({
        id: connectionId,
        userId: pending.userId,
        providerId: pending.providerId,
        externalId: completed.externalId,
        label: completed.label ?? null,
        holder,
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
