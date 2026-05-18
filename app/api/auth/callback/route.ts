import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as authStatesRepo from '@/lib/repositories/auth-states'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import { getProvider } from '@/lib/providers/registry'
import { syncConnection } from '@/lib/services/wealth'
import { AuthCallbackQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'
import { errorMessage, recordInitialSyncError } from '@/lib/api/route-helpers'

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

  // The auth state row carries its own userId from /api/auth/start, but
  // we still verify the household exists and matches — a single-tenant
  // sanity check that future multi-user changes won't silently break.
  const householdUser = usersRepo.getDefault()
  if (!householdUser || householdUser.id !== pending.userId) {
    authStatesRepo.deleteByState(state)
    return NextResponse.redirect(`${url.origin}/?error=unknown_state`)
  }

  try {
    const provider = getProvider(pending.providerId)
    if (!provider.completeAuth) {
      authStatesRepo.deleteByState(state)
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

    // Connection row is durable now; clear the single-use auth state.
    // (If completeAuth had thrown, we'd leave the row so the client can
    // retry with the same state instead of being stranded.)
    authStatesRepo.deleteByState(state)

    // Best-effort initial sync. Failures are persisted on the connection
    // row by the orchestrator (lastSyncError), so the dashboard surfaces
    // them — no need to fail the redirect.
    try {
      await syncConnection(connectionId)
    } catch (e) {
      recordInitialSyncError(connectionId, e, 'callback')
    }

    return NextResponse.redirect(`${url.origin}/?connected=${connectionId}`)
  } catch (e) {
    // Anything that throws here is recoverable on retry, so leave the
    // auth state row in place. (Stale rows time out on `expiresAt`.)
    return NextResponse.redirect(
      `${url.origin}/?error=${encodeURIComponent(errorMessage(e))}`,
    )
  }
}
