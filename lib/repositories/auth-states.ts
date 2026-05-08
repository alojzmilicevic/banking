// Auth-state repository — pending auth flows (redirect, polling, credentials).

import { eq } from 'drizzle-orm'
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

export function getByState(state: string, executor: Executor = db): AuthStateRow | null {
  return executor.select().from(authStates).where(eq(authStates.state, state)).get() ?? null
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
