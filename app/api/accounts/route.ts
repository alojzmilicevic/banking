import { NextResponse } from 'next/server'
import { desc, eq, inArray } from 'drizzle-orm'
import { accounts, balances, connections, db, users } from '@/lib/db/client'
import { pickBalance } from '@/lib/balance'
import { buildAccountSparklines } from '@/lib/sync/account-sparkline'

// GET /api/accounts → returns all connections for the default user, each with
// its accounts (including the current "best" balance per account, plus a
// 30-day sparkline). Pure DB read; never touches a provider.

export async function GET() {
  const user = db.select().from(users).get()
  if (!user) return NextResponse.json([])

  const conns = db
    .select()
    .from(connections)
    .where(eq(connections.userId, user.id))
    .orderBy(desc(connections.createdAt))
    .all()

  if (conns.length === 0) return NextResponse.json([])

  const allAccounts = db
    .select()
    .from(accounts)
    .where(inArray(accounts.connectionId, conns.map((c) => c.id)))
    .all()

  const accountIds = allAccounts.map((a) => a.id)
  const allBalances =
    accountIds.length > 0
      ? db.select().from(balances).where(inArray(balances.accountId, accountIds)).all()
      : []

  const balancesByAcct = new Map<string, typeof allBalances>()
  for (const b of allBalances) {
    const list = balancesByAcct.get(b.accountId)
    if (list) list.push(b)
    else balancesByAcct.set(b.accountId, [b])
  }

  const accsByConn = new Map<string, typeof allAccounts>()
  for (const a of allAccounts) {
    const list = accsByConn.get(a.connectionId)
    if (list) list.push(a)
    else accsByConn.set(a.connectionId, [a])
  }

  const sparklines = buildAccountSparklines(user.id)

  // Index connection holder by connection id for the joint-detection pass
  // and the per-account `derivedHolder`.
  const holderByConn = new Map<string, string | null>()
  for (const c of conns) holderByConn.set(c.id, c.holder ?? null)

  // External-id grouping: same IBAN/BBAN ⇒ same physical account.
  //   - If the group spans multiple holders → flag the group as joint.
  //   - The earliest-created stays canonical; later ones become dupes so
  //     the UI can surface a one-click exclude.
  const orderedAccounts = conns.flatMap((c) => accsByConn.get(c.id) ?? []).reverse()
  type ExtGroup = { canonicalId: string; holders: Set<string> }
  const groupByExternal = new Map<string, ExtGroup>()
  const dupeOf = new Map<string, string>()
  for (const a of orderedAccounts) {
    const ext = (a.iban ?? a.bban ?? '').trim()
    if (!ext) continue
    const h = holderByConn.get(a.connectionId)
    let group = groupByExternal.get(ext)
    if (!group) {
      group = { canonicalId: a.id, holders: new Set() }
      groupByExternal.set(ext, group)
    } else if (group.canonicalId !== a.id) {
      dupeOf.set(a.id, group.canonicalId)
    }
    if (h) group.holders.add(h)
  }
  // Per-account-id → derivedHolder. A group with >1 distinct holder means
  // the account is shared (joint). Groups with one holder pass through.
  const derivedHolderById = new Map<string, 'alma' | 'alojz' | 'joint' | null>()
  for (const a of orderedAccounts) {
    const ext = (a.iban ?? a.bban ?? '').trim()
    const connHolder = holderByConn.get(a.connectionId) ?? null
    const fallback =
      connHolder === 'alma' || connHolder === 'alojz' || connHolder === 'joint'
        ? connHolder
        : null
    const group = ext ? groupByExternal.get(ext) : undefined
    if (group && group.holders.size > 1) {
      derivedHolderById.set(a.id, 'joint')
    } else {
      derivedHolderById.set(a.id, fallback)
    }
  }

  const result = conns.map((c) => ({
    id: c.id,
    providerId: c.providerId,
    label: c.label,
    holder: c.holder ?? null,
    status: c.status,
    validUntil: c.validUntil,
    lastSyncedAt: c.lastSyncedAt,
    initialSyncedAt: c.initialSyncedAt,
    lastSyncError: c.lastSyncError,
    accounts: (accsByConn.get(c.id) ?? []).map((a) => {
      const best = pickBalance(balancesByAcct.get(a.id) ?? [])
      const spark = sparklines.get(a.id)
      const isInvestment = a.kind === 'investment' || a.kind === 'pension'

      // 30-day change. Absolute is always meaningful; pct only on
      // investment-shaped accounts. Cash account % is misleading because
      // most "growth" is just transfers in/out, not capital appreciation.
      let change30d: { absolute: number; pct: number | null } | null = null
      if (spark && spark.values.length >= 2) {
        const today = spark.values[0]
        const past = spark.values[spark.values.length - 1]
        const absolute = Math.round((today - past) * 100) / 100
        let pct: number | null = null
        if (isInvestment && past !== 0) {
          const raw = ((today - past) / Math.abs(past)) * 100
          // Sanity clamp: anything beyond ±500% is almost certainly a tiny
          // base getting funded (still a transfer story, not real growth).
          if (Number.isFinite(raw) && Math.abs(raw) <= 500) {
            pct = Math.round(raw * 100) / 100
          }
        }
        change30d = { absolute, pct }
      }
      return {
        id: a.id,
        name: a.name,
        details: a.details,
        product: a.product,
        accountType: a.accountType,
        currency: a.currency,
        iban: a.iban,
        bban: a.bban,
        bic: a.bic,
        kind: a.kind,
        excludedFromTotal: a.excludedFromTotal === 1,
        balance: best?.amount ?? null,
        balanceCurrency: best?.currency ?? a.currency ?? null,
        sparkline: spark?.series ?? null,
        change30d,
        possibleDuplicateOf: dupeOf.get(a.id) ?? null,
        derivedHolder: derivedHolderById.get(a.id) ?? null,
      }
    }),
  }))

  return NextResponse.json(result)
}
