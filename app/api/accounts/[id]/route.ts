import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { accounts, balances, connections, db } from '@/lib/db/client'
import { setAccountExcluded } from '@/lib/services/wealth'
import { PatchAccountBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'

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
// Toggles whether an account contributes to the user's wealth total.
// The wealth service handles the snapshot rebuild so the chart updates
// in step.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = await validateJson(req, PatchAccountBodySchema)
  if (!parsed.ok) return parsed.response

  const result = setAccountExcluded(id, parsed.data.excludedFromTotal)
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
