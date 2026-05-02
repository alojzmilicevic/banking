import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { authStates, db, users } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
import { StartAuthBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'

// POST /api/auth/start
//   body: { providerId: string; flow?: AuthFlow; holder?: 'alma'|'alojz'|'joint'; input?: Record<string, unknown> }
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

    let user = db.select().from(users).get()
    if (!user) {
      const id = randomUUID()
      db.insert(users).values({ id, name: 'Alojz' }).run()
      user = db.select().from(users).get()!
    }

    const state = randomUUID()
    const origin = new URL(req.url).origin
    const redirectUrl = `${origin}/api/auth/callback`

    const challenge = await provider.startAuth({
      userId: user.id,
      flow,
      redirectUrl,
      state,
      // Forward the holder via input so cookie-flow providers (Avanza)
      // can persist it directly on the connection they create.
      input: { ...(body.input ?? {}), holder: body.holder ?? null },
    })

    // For redirect/polling flows the connection is created later (by the
    // callback or poll handler), so we stash the holder + payload here so
    // the callback can read it back.
    if (challenge.kind === 'redirect' || challenge.kind === 'polling' || challenge.kind === 'pending') {
      db.insert(authStates)
        .values({
          state,
          userId: user.id,
          providerId: provider.id,
          flow,
          status: 'pending',
          payload: JSON.stringify({ holder: body.holder ?? null, input: body.input ?? {} }),
          expiresAt: Date.now() + AUTH_STATE_TTL_MS,
        })
        .run()
    }

    return NextResponse.json(challenge)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
