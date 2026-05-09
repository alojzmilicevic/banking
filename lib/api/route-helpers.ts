// Tiny utilities shared across route handlers. Keeping them here avoids
// the same five-line patterns drifting between routes (auth check,
// error-shape, error-message extraction).

import { NextResponse } from 'next/server'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as usersRepo from '@/lib/repositories/users'
import type { User } from '@/lib/db/schema'

// Safe extraction: handles `throw new Error('x')`, `throw 'x'`, and
// providers that throw plain objects. Replaces the unsafe `(e as Error).message`
// cast used at the top of several routes.
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function internalServerError(e: unknown): NextResponse {
  return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
}

// Single-tenant gate: returns the household's user row, or a ready-made
// 401 response if the DB hasn't been bootstrapped yet (first run with no
// connections). Routes branch on `result.user`/`result.response`.
export type RequireUserResult =
  | { user: User; response?: never }
  | { user?: never; response: NextResponse }

export function requireUser(): RequireUserResult {
  const user = usersRepo.getDefault()
  if (!user) {
    return { response: NextResponse.json({ error: 'No user' }, { status: 401 }) }
  }
  return { user }
}

// auth/callback and auth/poll both kick off an initial sync after the
// connection lands. The sync may already have persisted its own error
// via the orchestrator's classify-and-write path, but anything that
// escapes (snapshot rebuild, persist, etc.) needs a backstop so the FE
// can still surface "this just-linked connection didn't sync."
export function recordInitialSyncError(
  connectionId: string,
  e: unknown,
  tag: string,
): void {
  console.error(`[${tag}] initial sync of ${connectionId} failed:`, e)
  try {
    connectionsRepo.update(connectionId, {
      lastSyncError: `[initial] ${errorMessage(e)}`,
    })
  } catch (persistErr) {
    console.error(`[${tag}] could not persist initial sync error:`, persistErr)
  }
}
