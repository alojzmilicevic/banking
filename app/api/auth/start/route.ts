import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { authStates, db, users } from '@/lib/db/client'
import { getProvider } from '@/lib/providers/registry'

// POST /api/auth/start
// Body: { providerId: 'enable-banking', extra: { aspspName, aspspCountry } }
// Returns: { url } — the bank's auth page

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { providerId: string; extra: Record<string, unknown> }
    if (!body.providerId) {
      return NextResponse.json({ error: 'providerId required' }, { status: 400 })
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

    const provider = getProvider(body.providerId)
    const auth = await provider.startAuth({
      redirectUrl,
      state,
      extra: body.extra ?? {},
    })

    db.insert(authStates)
      .values({
        state,
        userId: user.id,
        providerId: body.providerId,
        payload: JSON.stringify(body.extra ?? {}),
      })
      .run()

    return NextResponse.json({ url: auth.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
