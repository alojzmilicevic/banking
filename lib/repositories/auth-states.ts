// Auth-state repository — pending auth flows (redirect, polling, credentials).

import { eq } from 'drizzle-orm'
import { authStates, db } from '@/lib/db/client'

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

export function getByState(state: string): AuthStateRow | null {
  return db.select().from(authStates).where(eq(authStates.state, state)).get() ?? null
}

export function create(input: {
  state: string
  userId: string
  providerId: string
  flow: string
  payload: string
  expiresAt: number
}): void {
  db.insert(authStates)
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

export function deleteByState(state: string): void {
  db.delete(authStates).where(eq(authStates.state, state)).run()
}
