import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as authStatesRepo from '@/lib/repositories/auth-states'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as holdersRepo from '@/lib/repositories/holders'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/services/wealth'
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

  const pending = authStatesRepo.getByState(state)
  if (!pending) {
    return NextResponse.redirect(`${url.origin}/?error=unknown_state`)
  }

  // Single-use; clean up regardless of outcome.
  authStatesRepo.deleteByState(state)

  try {
    const provider = getProvider(pending.providerId)
    if (!provider.completeAuth) {
      return NextResponse.redirect(
        `${url.origin}/?error=${encodeURIComponent(`${provider.name} has no callback flow`)}`,
      )
    }
    const completed = await provider.completeAuth({ state, code: code ?? undefined })

    // Read holderId stashed at /api/auth/start. Validate against this user
    // so a stale or tampered payload can't link under someone else's
    // holder.
    let holderId: string | null = null
    try {
      const parsedPayload = JSON.parse(pending.payload) as { holderId?: string | null }
      if (parsedPayload.holderId) {
        const h = holdersRepo.getById(parsedPayload.holderId)
        if (h && h.userId === pending.userId) holderId = h.id
      }
    } catch {
      // Legacy / malformed payload — leave holderId unset.
    }

    const connectionId = randomUUID()
    connectionsRepo.createWithHolder(
      {
        id: connectionId,
        userId: pending.userId,
        providerId: pending.providerId,
        externalId: completed.externalId,
        label: completed.label ?? null,
        validUntil: completed.validUntil ?? null,
        rawJson: JSON.stringify(completed.raw),
      },
      holderId,
    )

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
