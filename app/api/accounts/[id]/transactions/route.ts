import { NextResponse } from 'next/server'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { db, transactions } from '@/lib/db/client'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  const filters = [eq(transactions.accountId, id)]
  if (dateFrom) filters.push(gte(transactions.date, dateFrom))
  if (dateTo) filters.push(lte(transactions.date, dateTo))

  const rows = db
    .select()
    .from(transactions)
    .where(and(...filters))
    .orderBy(desc(transactions.date))
    .all()

  return NextResponse.json({
    transactions: rows.map((r) => ({
      fingerprint: r.fingerprint,
      date: r.date,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      description: r.description,
      counterparty: r.counterparty,
    })),
  })
}
