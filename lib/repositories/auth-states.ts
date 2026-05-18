// Auth-state repository — pending auth flows (redirect, polling, credentials).

import { eq, lt } from 'drizzle-orm'
import { authStates, db, type Executor } from '@/lib/db/client'

export interface AuthStateRow {
  state: string
  userId: string
  providerId: string
  flow: string
  status: string
  payload: string
  result: string | null
  createdAt: number
  expiresAt: number
}

// Returns the row only if it hasn't expired. Stale rows are filtered out so
// a leaked redirect URL (browser history, server logs, referer) can't be
// replayed indefinitely to attach a stolen auth session.
export function getByState(state: string, executor: Executor = db): AuthStateRow | null {
  const row = executor.select().from(authStates).where(eq(authStates.state, state)).get() ?? null
  if (!row) return null
  if (row.expiresAt <= Date.now()) return null
  return row
}

// Best-effort sweep of expired rows. Called opportunistically from the auth
// routes; cheap enough to run on every flow start.
export function deleteExpired(executor: Executor = db): void {
  executor.delete(authStates).where(lt(authStates.expiresAt, Date.now())).run()
}

export function create(
  input: {
    state: string
    userId: string
    providerId: string
    flow: string
    payload: string
    expiresAt: number
  },
  executor: Executor = db,
): void {
  executor
    .insert(authStates)
    .values({
      state: input.state,
      userId: input.userId,
      providerId: input.providerId,
      flow: input.flow,
      status: 'pending',
      payload: input.payload,
      expiresAt: input.expiresAt,
    })
    .run()
}

export function deleteByState(state: string, executor: Executor = db): void {
  executor.delete(authStates).where(eq(authStates.state, state)).run()
}
