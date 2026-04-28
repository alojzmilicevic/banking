import { NextResponse } from 'next/server'
import { and, desc, eq, gte, ne, sql } from 'drizzle-orm'
import { accounts, balances, connections, db, transactions, users } from '@/lib/db/client'

// Order from "most authoritative current snapshot" → "best-effort fallback".
// EB providers report either Berlin Group ISO 20022 codes (CLBD, ITBD, …)
// or their long-form names (closingBooked, interimBooked, …). Cover both.
const BALANCE_PREFERENCE = [
  'closingBooked',
  'CLBD',
  'interimBooked',
  'ITBD',
  'expected',
  'XPCD',
  'interimAvailable',
  'ITAV',
  'forwardAvailable',
  'FWAV',
  'openingBooked',
  'OPBD',
]

const MS_DAY = 86400_000

function startOfUTCDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

interface Tx {
  date: string
  amount: number
}

function buildSeries(currentTotal: number, txs: Tx[], lookbackDays = 365) {
  const today = startOfUTCDay(new Date())
  // Sort descending so we walk back in time accumulating txs after each boundary.
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date))

  const points: { date: string; total: number }[] = []
  let running = currentTotal
  let cursor = 0

  for (let d = 0; d <= lookbackDays; d++) {
    const dayStart = new Date(today.getTime() - d * MS_DAY)
    const dayStartIso = dayStart.toISOString().slice(0, 10)

    // Subtract every tx with date strictly after this snapshot day.
    while (cursor < sorted.length && sorted[cursor].date > dayStartIso) {
      running -= sorted[cursor].amount
      cursor++
    }
    points.push({ date: dayStartIso, total: Math.round(running * 100) / 100 })
  }

  return points.reverse()
}

export async function GET() {
  const user = db.select().from(users).get()
  if (!user) {
    return NextResponse.json({ series: [], currency: null, accounts: 0, errors: ['no user'] })
  }

  // Find every account belonging to this user via their connections.
  const userConns = db
    .select()
    .from(connections)
    .where(eq(connections.userId, user.id))
    .all()
  const connIds = new Set(userConns.map((c) => c.id))

  const allAccounts = db
    .select()
    .from(accounts)
    .all()
    .filter((a) => connIds.has(a.connectionId))

  // Sum of preferred balances across accounts (skip currency mismatches).
  let currentTotal = 0
  let currency: string | null = null
  const errors: string[] = []
  const usableAccountIds: string[] = []

  for (const a of allAccounts) {
    const accBalances = db.select().from(balances).where(eq(balances.accountId, a.id)).all()
    if (accBalances.length === 0) continue
    let picked = accBalances[0]
    for (const t of BALANCE_PREFERENCE) {
      const m = accBalances.find((b) => b.balanceType === t)
      if (m) {
        picked = m
        break
      }
    }
    if (!currency) currency = picked.currency
    if (picked.currency !== currency) {
      errors.push(`${a.details ?? a.id}: ${picked.currency} ≠ ${currency}`)
      continue
    }
    currentTotal += picked.amount
    usableAccountIds.push(a.id)
  }

  // Pull last 12 months of booked transactions for the usable accounts.
  const since = new Date(Date.now() - 365 * MS_DAY).toISOString().slice(0, 10)
  const rawTxs =
    usableAccountIds.length === 0
      ? []
      : db
          .select({ date: transactions.date, amount: transactions.amount })
          .from(transactions)
          .where(
            and(
              gte(transactions.date, since),
              ne(transactions.status, 'PDNG'),
              ne(transactions.status, 'INFO'),
              sql`${transactions.accountId} IN (${sql.join(
                usableAccountIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          )
          .orderBy(desc(transactions.date))
          .all()

  const series = buildSeries(currentTotal, rawTxs)

  return NextResponse.json({
    series,
    currency,
    accounts: allAccounts.length,
    errors: errors.length ? errors : undefined,
  })
}
