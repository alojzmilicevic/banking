// POST /api/avanza/ping — keep the cookie-based session alive.
//
// Avanza's session has a ~60-minute idle timeout. A user staring at the
// dashboard without syncing would silently lose their session and the next
// real sync would fail with a re-link prompt. Instead, the client polls
// this endpoint every ~25 min (well under the timeout) — each ping touches
// a real `/_api` endpoint, which:
//   1. Refreshes the idle timer on Avanza's side.
//   2. Lets us absorb any rotated cookies (AZACSRF in particular rotates).
//   3. Confirms the session still works → we extend `validUntil` for the
//      "consent expires in N min" pill, or mark the connection expired
//      and surface a re-link prompt if the cookies have died.
//
// The endpoint we hit is the same one the real sync uses, so a green ping
// is exactly what a real sync would see.

import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { connections, db, users } from '@/lib/db/client'
import { loadCredentials, saveCredentials } from '@/lib/sync/credentials'
import { AvanzaApi } from '@/lib/providers/avanza/api'
import { paths } from '@/lib/providers/avanza/constants'
import { AuthExpiredError } from '@/lib/sync/errors'

const SESSION_LIFETIME_MS = 60 * 60 * 1000

export async function POST() {
  const user = db.select().from(users).get()
  if (!user) return NextResponse.json({ alive: false, reason: 'no-user' })

  const conn = db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, user.id), eq(connections.providerId, 'avanza')))
    .get()
  if (!conn) return NextResponse.json({ alive: false, reason: 'not-linked' })

  const creds = loadCredentials(conn.id) as
    | { cookies?: Record<string, string> }
    | null
  const cookies = creds?.cookies
  if (!cookies || Object.keys(cookies).length === 0) {
    return NextResponse.json({ alive: false, reason: 'no-cookies' })
  }

  const api = new AvanzaApi({ cookies, expiresAt: 0 })

  try {
    // CATEGORIZED_ACCOUNTS is the real sync's first call — proves the
    // session is fully usable, not just "tokens parse OK".
    await api.get(paths.CATEGORIZED_ACCOUNTS)

    const validUntil = Date.now() + SESSION_LIFETIME_MS
    db.update(connections)
      .set({ validUntil, lastSyncError: null })
      .where(eq(connections.id, conn.id))
      .run()
    // AZACSRF rotates on most calls — persist the refreshed jar so the next
    // sync doesn't send the stale value and trip the CSRF check.
    saveCredentials(conn.id, { cookies: api.cookieMap() })

    return NextResponse.json({ alive: true, validUntil })
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      db.update(connections)
        .set({
          validUntil: Date.now(),
          lastSyncError: '[auth-expired] Avanza cookies invalid — re-link',
        })
        .where(eq(connections.id, conn.id))
        .run()
      return NextResponse.json({ alive: false, reason: 'auth-expired' })
    }
    // Network / 5xx / unknown — don't mark expired, just report. The next
    // ping will retry.
    return NextResponse.json(
      { alive: false, reason: 'error', message: (e as Error).message },
      { status: 502 },
    )
  }
}
