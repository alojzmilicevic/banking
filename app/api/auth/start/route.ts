import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db, users } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'
import type { AuthFlow } from '@/lib/providers/types'

// POST /api/auth/start
//   body: { providerId: string; flow?: AuthFlow; input?: Record<string, unknown> }
//   returns AuthChallenge — caller branches on `kind`:
//     'redirect' → window.location = url
//     'polling'  → start polling /api/auth/poll
//     'complete' → done
//     'error'    → show message

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      providerId: string
      flow?: AuthFlow
      input?: Record<string, unknown>
    }
    if (!body.providerId) {
      return NextResponse.json({ error: 'providerId required' }, { status: 400 })
    }
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
      input: body.input ?? {},
    })

    return NextResponse.json(challenge)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
