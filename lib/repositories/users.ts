// Users repository — drizzle queries only, no business logic.
//
// Single-tenant for now: the app boots with one users row representing
// the household. `getDefault()` returns it (or null when the DB is
// fresh).

import { eq } from 'drizzle-orm'
import { db, users } from '@/lib/db/client'
import type { User } from '@/lib/db/schema'

export function getDefault(): User | null {
  return db.select().from(users).get() ?? null
}

export function getById(id: string): User | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null
}

export function create(input: { id: string; name: string }): User {
  db.insert(users).values({ id: input.id, name: input.name }).run()
  return db.select().from(users).where(eq(users.id, input.id)).get()!
}

export function listAll(): User[] {
  return db.select().from(users).all()
}
