import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as authStatesRepo from '@/lib/repositories/auth-states'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import { getProvider } from '@/lib/providers/registry'
import { StartAuthBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'
import { internalServerError } from '@/lib/api/route-helpers'

// POST /api/auth/start
//   body: { providerId: string; flow?: AuthFlow; holderId?: string; input?: Record<string, unknown> }
//   returns AuthChallenge — caller branches on `kind`:
//     'redirect' → window.location = url
//     'polling'  → start polling /api/auth/poll
//     'complete' → done
//     'error'    → show message

const AUTH_STATE_TTL_MS = 30 * 60 * 1000

export async function POST(req: Request) {
  const parsed = await validateJson(req, StartAuthBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  try {
    const provider = getProvider(body.providerId)
    const flow = body.flow ?? provider.authFlows[0]
    if (!provider.authFlows.includes(flow)) {
      return NextResponse.json(
        { error: `Provider ${provider.id} doesn't support flow ${flow}` },
        { status: 400 },
      )
    }

    // Bootstrap on first link. The user row represents the household;
    // individual people become rows in `holders` (added later from the
    // settings UI or by the migration on existing DBs).
    let user = usersRepo.getDefault()
    if (!user) {
      user = usersRepo.create({ id: randomUUID(), name: 'Household' })
    }

    // Validate that the supplied holderId belongs to this user. Reject
    // arbitrary uuids so a malicious client can't link connections under
    // someone else's holder.
    if (body.holderId) {
      const holder = holdersRepo.getById(body.holderId)
      if (!holder || holder.userId !== user.id) {
        return NextResponse.json({ error: 'Unknown holderId' }, { status: 400 })
      }
    }

    const state = randomUUID()
    const origin = new URL(req.url).origin
    const redirectUrl = `${origin}/api/auth/callback`

    const challenge = await provider.startAuth({
      userId: user.id,
      flow,
      redirectUrl,
      state,
      // Forward holderId via input so cookie-flow providers (Avanza) can
      // wire up `connection_holders` directly when they create the row.
      input: { ...(body.input ?? {}), holderId: body.holderId ?? null },
    })

    // For redirect/polling flows the connection is created later (by the
    // callback or poll handler), so we stash the holderId + payload here
    // so the callback can read it back.
    if (challenge.kind === 'redirect' || challenge.kind === 'polling' || challenge.kind === 'pending') {
      authStatesRepo.create({
        state,
        userId: user.id,
        providerId: provider.id,
        flow,
        payload: JSON.stringify({ holderId: body.holderId ?? null, input: body.input ?? {} }),
        expiresAt: Date.now() + AUTH_STATE_TTL_MS,
      })
    }

    return NextResponse.json(challenge)
  } catch (e) {
    return internalServerError(e)
  }
}
