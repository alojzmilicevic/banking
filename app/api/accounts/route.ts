import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { accounts, connections, db, users } from '@/lib/db/client'

// GET /api/accounts → returns all connections for the default user, each with
// its accounts. Pure DB read; never touches a provider.

export async function GET() {
  const user = db.select().from(users).get()
  if (!user) return NextResponse.json([])

  const conns = db
    .select()
    .from(connections)
    .where(eq(connections.userId, user.id))
    .orderBy(sql`${connections.createdAt} DESC`)
    .all()

  const result = conns.map((c) => {
    const accs = db.select().from(accounts).where(eq(accounts.connectionId, c.id)).all()
    return {
      id: c.id,
      providerId: c.providerId,
      label: c.label,
      status: c.status,
      validUntil: c.validUntil,
      lastSyncedAt: c.lastSyncedAt,
      initialSyncedAt: c.initialSyncedAt,
      accounts: accs.map((a) => ({
        id: a.id,
        name: a.name,
        details: a.details,
        product: a.product,
        accountType: a.accountType,
        currency: a.currency,
        iban: a.iban,
        bban: a.bban,
        bic: a.bic,
      })),
    }
  })

  return NextResponse.json(result)
}
