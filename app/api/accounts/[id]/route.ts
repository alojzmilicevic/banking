import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { accounts, balances, connections, db } from '@/lib/db/client'
import { rebuildSnapshotsForUser } from '@/lib/sync/snapshots'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const account = db.select().from(accounts).where(eq(accounts.id, id)).get()
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const conn = db.select().from(connections).where(eq(connections.id, account.connectionId)).get()
  const bals = db.select().from(balances).where(eq(balances.accountId, id)).all()

  return NextResponse.json({
    account: {
      id: account.id,
      name: account.name,
      details: account.details,
      product: account.product,
      accountType: account.accountType,
      currency: account.currency,
      iban: account.iban,
      bban: account.bban,
      bic: account.bic,
      kind: account.kind,
      excludedFromTotal: account.excludedFromTotal === 1,
    },
    connection: conn
      ? {
          id: conn.id,
          providerId: conn.providerId,
          label: conn.label,
          validUntil: conn.validUntil,
          lastSyncedAt: conn.lastSyncedAt,
        }
      : null,
    balances: bals.map((b) => ({
      balanceType: b.balanceType,
      amount: b.amount,
      currency: b.currency,
      referenceDate: b.referenceDate,
    })),
  })
}

// PATCH /api/accounts/:id  body { excludedFromTotal: boolean }
// Toggles whether an account contributes to the user's wealth total. Also
// rebuilds the user's daily snapshots so the chart updates immediately.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = db.select().from(accounts).where(eq(accounts.id, id)).get()
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json()) as { excludedFromTotal?: boolean }
  if (typeof body.excludedFromTotal !== 'boolean') {
    return NextResponse.json({ error: 'excludedFromTotal (boolean) required' }, { status: 400 })
  }

  db.update(accounts)
    .set({ excludedFromTotal: body.excludedFromTotal ? 1 : 0 })
    .where(eq(accounts.id, id))
    .run()

  // Recompute the daily wealth chart so the change shows up immediately.
  const conn = db.select().from(connections).where(eq(connections.id, account.connectionId)).get()
  if (conn) rebuildSnapshotsForUser(conn.userId, { daysBack: 365 })

  return NextResponse.json({ id, excludedFromTotal: body.excludedFromTotal })
}
