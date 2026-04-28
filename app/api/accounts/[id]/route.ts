import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { accounts, balances, connections, db } from '@/lib/db/client'

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
