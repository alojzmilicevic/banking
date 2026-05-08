// Users repository — drizzle queries only, no business logic.
//
// Single-tenant for now: the app boots with one users row representing
// the household. `getDefault()` returns it (or null when the DB is
// fresh).

import { eq } from 'drizzle-orm'
import { db, users, type Executor } from '@/lib/db/client'
import type { User } from '@/lib/db/schema'

export function getDefault(executor: Executor = db): User | null {
  return executor.select().from(users).get() ?? null
}

export function getById(id: string, executor: Executor = db): User | null {
  return executor.select().from(users).where(eq(users.id, id)).get() ?? null
}

export function create(
  input: { id: string; name: string },
  executor: Executor = db,
): User {
  executor.insert(users).values({ id: input.id, name: input.name }).run()
  const row = executor.select().from(users).where(eq(users.id, input.id)).get()
  if (!row) throw new Error(`users.create: insert returned no row for id=${input.id}`)
  return row
}

export function listAll(executor: Executor = db): User[] {
  return executor.select().from(users).all()
}
