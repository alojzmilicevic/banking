// Dashboard service implementation. Pure server-side — drizzle repos +
// pickBalance + sparklines. Types live in lib/api/dashboard.ts so the FE
// can import them without dragging server code into the client bundle.

import * as accountsRepo from '@/lib/repositories/accounts'
import * as balancesRepo from '@/lib/repositories/balances'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as holdersRepo from '@/lib/repositories/holders'
import { pickBalance } from '@/lib/balance'
import { buildAccountSparklines } from '@/lib/sync/account-sparkline'
import { daysForPeriod, type Period } from '@/lib/services/timeseries'
import type { Account, Balance, Connection, HolderRow } from '@/lib/db/schema'
import type {
  ChangePill,
  DashboardAccount,
  DashboardBucket,
  DashboardHolder,
  DashboardResponse,
} from '@/lib/api/dashboard'

export type {
  ChangePill,
  DashboardAccount,
  DashboardAccountConnection,
  DashboardBucket,
  DashboardHolder,
  DashboardResponse,
  DashboardSharedBucket,
  DashboardTotals,
  DashboardUnassignedBucket,
  TimeseriesPoint,
  TimeseriesResponse,
} from '@/lib/api/dashboard'

// ─── Service: getDashboard ───────────────────────────────────────────────

const BASE_CURRENCY = 'SEK'

interface AccountClassification {
  account: Account
  connection: Connection
  // Resolved holderIds for this account's connection (from the M:N table).
  connHolderIds: string[]
  // Joint-by-IBAN: same external id appears under a connection owned by a
  // DIFFERENT holder set than this one's. Computed per account, not per
  // connection.
  ibanJoint: boolean
  // Earliest-created copy in its IBAN group is canonical; later ones get
  // possibleDuplicateOf set to the canonical's id.
  possibleDuplicateOf: string | null
}

function classifyAccounts(
  conns: Connection[],
  accs: Account[],
  holderIdsByConn: Map<string, string[]>,
): AccountClassification[] {
  const connById = new Map(conns.map((c) => [c.id, c]))

  // Group physical accounts by external id (IBAN preferred, BBAN fallback).
  // Earliest-created is canonical; we need this regardless of joint-detection
  // because the FE shows the dupes with possibleDuplicateOf set so they can
  // be hidden.
  type Group = { canonicalId: string; canonicalCreatedAt: number; holderSets: Set<string> }
  const groups = new Map<string, Group>()
  for (const a of accs) {
    const ext = (a.iban ?? a.bban ?? '').trim()
    if (!ext) continue
    const ownerKey = (holderIdsByConn.get(a.connectionId) ?? []).slice().sort().join(',')
    let g = groups.get(ext)
    if (!g) {
      g = { canonicalId: a.id, canonicalCreatedAt: a.createdAt, holderSets: new Set() }
      groups.set(ext, g)
    } else if (a.createdAt < g.canonicalCreatedAt) {
      g.canonicalCreatedAt = a.createdAt
      g.canonicalId = a.id
    }
    g.holderSets.add(ownerKey || '<unassigned>')
  }

  return accs.map((a) => {
    const ext = (a.iban ?? a.bban ?? '').trim()
    const g = ext ? groups.get(ext) : undefined
    const ibanJoint = !!g && g.holderSets.size > 1
    const possibleDuplicateOf =
      g && g.canonicalId !== a.id ? g.canonicalId : null
    return {
      account: a,
      connection: connById.get(a.connectionId)!,
      connHolderIds: holderIdsByConn.get(a.connectionId) ?? [],
      ibanJoint,
      possibleDuplicateOf,
    }
  })
}

function bucketFor(c: AccountClassification): DashboardBucket {
  // Explicit joint: connection has 2+ holders attached → shared.
  if (c.connHolderIds.length >= 2) return { kind: 'shared' }
  // Auto joint: same physical account exists under a different holder set.
  if (c.ibanJoint) return { kind: 'shared' }
  // Personal: exactly one holder.
  if (c.connHolderIds.length === 1) {
    return { kind: 'holder', holderId: c.connHolderIds[0] }
  }
  // No holders attached → unassigned.
  return { kind: 'unassigned' }
}

function pickAccountBalance(b: Balance[]): { amount: number; currency: string } | null {
  const picked = pickBalance(b)
  if (!picked) return null
  return { amount: picked.amount, currency: picked.currency }
}

function isInvestmentKind(kind: string | null | undefined): boolean {
  return kind === 'investment' || kind === 'pension'
}

function buildAccount(
  c: AccountClassification,
  balancesForAcct: Balance[],
  spark: ReturnType<typeof buildAccountSparklines> extends Map<string, infer V> ? V | undefined : never,
): DashboardAccount {
  const best = pickAccountBalance(balancesForAcct)
  const isInvestment = isInvestmentKind(c.account.kind)

  let change: ChangePill | null = null
  if (spark && spark.values.length >= 2) {
    const today = spark.values[0]
    // Prefer provider-reported growth (Avanza's absoluteSeries diff) — it's
    // already deposit-adjusted. Fall back to the tx-based estimate only
    // for providers that actually ship transactions (EB). Avanza syncs no
    // transactions, so `netDeposits` is always 0 — the fallback would
    // report raw balance change including deposits and divide it by a
    // dust-sized past value (e.g. a brand-new ISK that started near 0).
    let growth: number | null = null
    if (spark.growth != null) {
      growth = spark.growth
    } else if (c.connection.providerId === 'enable-banking') {
      const past = spark.values[spark.values.length - 1]
      growth = today - past - spark.netDeposits
    }
    if (growth != null) {
      const absolute = Math.round(growth * 100) / 100
      let pct: number | null = null
      if (isInvestment) {
        // Denominator = capital deployed (today − growth). Approximates
        // "starting balance + net deposits during the window" and stays
        // stable when an account was empty at window start, which would
        // otherwise blow up `growth / past` to millions of percent.
        const deployed = today - growth
        if (deployed > 0) {
          const raw = (growth / deployed) * 100
          if (Number.isFinite(raw)) {
            pct = Math.round(raw * 100) / 100
          }
        }
      }
      change = { absolute, pct }
    }
  }

  return {
    id: c.account.id,
    name: c.account.name,
    details: c.account.details,
    product: c.account.product,
    accountType: c.account.accountType,
    currency: c.account.currency,
    iban: c.account.iban,
    bban: c.account.bban,
    bic: c.account.bic,
    kind: c.account.kind,
    excludedFromTotal: c.account.excludedFromTotal === 1,
    balance: best?.amount ?? null,
    balanceCurrency: best?.currency ?? c.account.currency ?? null,
    sparkline: spark?.series ?? null,
    change,
    bucket: bucketFor(c),
    possibleDuplicateOf: c.possibleDuplicateOf,
    connection: {
      id: c.connection.id,
      providerId: c.connection.providerId,
      label: c.connection.label,
      status: c.connection.status,
      validUntil: c.connection.validUntil,
      lastSyncedAt: c.connection.lastSyncedAt,
      lastSyncError: c.connection.lastSyncError,
      ...extractAspsp(c.connection.providerId, c.connection.rawJson),
    },
  }
}

// Pull aspspName/aspspCountry out of an EB connection's rawJson. The
// callback flow stores `{ aspsp: { name, country } }`; the legacy import
// path stored snake_case `{ aspsp_name, aspsp_country }`. Either is fine.
// Returns nulls for non-EB providers and for malformed/legacy rawJson.
function extractAspsp(
  providerId: string,
  rawJson: string | null,
): { aspspName: string | null; aspspCountry: string | null } {
  if (providerId !== 'enable-banking' || !rawJson) {
    return { aspspName: null, aspspCountry: null }
  }
  try {
    const raw = JSON.parse(rawJson) as {
      aspsp?: { name?: string; country?: string }
      aspsp_name?: string
      aspsp_country?: string
    }
    return {
      aspspName: raw.aspsp?.name ?? raw.aspsp_name ?? null,
      aspspCountry: raw.aspsp?.country ?? raw.aspsp_country ?? null,
    }
  } catch {
    return { aspspName: null, aspspCountry: null }
  }
}

interface BucketTotals {
  total: number
  cash: number
  investment: number
  // Sum of per-account growth (deposit-adjusted). Aggregated from
  // a.change.absolute, which the buildAccount step has already stripped of
  // money moved in or out.
  absoluteGrowth: number
  // Sum of per-account capital deployed (today's balance − the growth
  // attributed to it). Approximates "starting balance + net deposits"
  // across the window and stays sensible even when individual accounts
  // were empty at the start of the period.
  deployedTotal: number
}

function emptyBucketTotals(): BucketTotals {
  return { total: 0, cash: 0, investment: 0, absoluteGrowth: 0, deployedTotal: 0 }
}

function addToBucket(b: BucketTotals, a: DashboardAccount, isInvestment: boolean) {
  // Only canonical, non-excluded accounts contribute to totals — the dupe
  // copy (possibleDuplicateOf set) and excluded-from-total accounts are
  // present in the response (so the UI can show them in "hidden") but
  // don't count toward the household number.
  if (a.excludedFromTotal || a.possibleDuplicateOf) return
  const amt = a.balance ?? 0
  b.total += amt
  if (isInvestment) b.investment += amt
  else b.cash += amt
  if (a.change) {
    b.absoluteGrowth += a.change.absolute
    b.deployedTotal += amt - a.change.absolute
  }
}

function changeFromBucket(b: BucketTotals): ChangePill | null {
  if (b.absoluteGrowth === 0 && b.deployedTotal === 0) return null
  let pct: number | null = null
  if (b.deployedTotal > 0) {
    const raw = (b.absoluteGrowth / b.deployedTotal) * 100
    if (Number.isFinite(raw)) {
      pct = Math.round(raw * 100) / 100
    }
  }
  return { absolute: Math.round(b.absoluteGrowth * 100) / 100, pct }
}

export function getDashboard(userId: string, period: Period = '1Y'): DashboardResponse {
  const errors: string[] = []

  const holderRows = holdersRepo.listForUser(userId)
  const conns = connectionsRepo.listForUser(userId)

  if (conns.length === 0) {
    return {
      holders: holderRows.map(holderRowToDashboardEmpty),
      shared: { total: 0, change: null, accounts: [] },
      unassigned: null,
      totals: { total: 0, cash: 0, investment: 0, change: null },
      baseCurrency: BASE_CURRENCY,
      errors,
    }
  }

  const accs = accountsRepo.listByConnectionIds(conns.map((c) => c.id))
  const allBalances = balancesRepo.listByAccountIds(accs.map((a) => a.id))
  const balancesByAcct = groupBy(allBalances, (b) => b.accountId)
  const holderIdsByConn = holdersRepo.getHolderIdsByConnection(conns.map((c) => c.id))
  const sparklines = buildAccountSparklines(userId, daysForPeriod(period, userId))

  const classified = classifyAccounts(conns, accs, holderIdsByConn)
  const built = classified.map((c) =>
    buildAccount(c, balancesByAcct.get(c.account.id) ?? [], sparklines.get(c.account.id)),
  )

  // Bucket by holder id / shared / unassigned. Holder buckets are
  // pre-seeded (so empty holders still appear in the UI in their
  // configured display order).
  const holderAccounts = new Map<string, DashboardAccount[]>()
  const holderTotals = new Map<string, BucketTotals>()
  for (const h of holderRows) {
    holderAccounts.set(h.id, [])
    holderTotals.set(h.id, emptyBucketTotals())
  }
  const sharedAccounts: DashboardAccount[] = []
  const sharedTotals = emptyBucketTotals()
  const unassignedAccounts: DashboardAccount[] = []
  const unassignedTotals = emptyBucketTotals()
  const grand = emptyBucketTotals()

  for (const a of built) {
    const isInvestment = isInvestmentKind(a.kind)
    if (a.bucket.kind === 'holder') {
      const list = holderAccounts.get(a.bucket.holderId)
      const tot = holderTotals.get(a.bucket.holderId)
      if (!list || !tot) {
        // Dangling holderId (holder was deleted but link wasn't cleaned up).
        // Treat as unassigned so the FE still surfaces the account.
        unassignedAccounts.push(a)
        addToBucket(unassignedTotals, a, isInvestment)
      } else {
        list.push(a)
        addToBucket(tot, a, isInvestment)
      }
    } else if (a.bucket.kind === 'shared') {
      sharedAccounts.push(a)
      addToBucket(sharedTotals, a, isInvestment)
    } else {
      unassignedAccounts.push(a)
      addToBucket(unassignedTotals, a, isInvestment)
    }
    addToBucket(grand, a, isInvestment)
  }

  return {
    holders: holderRows.map((h) => ({
      id: h.id,
      label: h.label,
      color: h.color,
      initials: h.initials,
      displayOrder: h.displayOrder,
      total: round2(holderTotals.get(h.id)!.total),
      change: changeFromBucket(holderTotals.get(h.id)!),
      accounts: holderAccounts.get(h.id)!,
    })),
    shared: {
      total: round2(sharedTotals.total),
      change: changeFromBucket(sharedTotals),
      accounts: sharedAccounts,
    },
    unassigned:
      unassignedAccounts.length === 0
        ? null
        : { total: round2(unassignedTotals.total), accounts: unassignedAccounts },
    totals: {
      total: round2(grand.total),
      cash: round2(grand.cash),
      investment: round2(grand.investment),
      change: changeFromBucket(grand),
    },
    baseCurrency: BASE_CURRENCY,
    errors,
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────

function holderRowToDashboardEmpty(h: HolderRow): DashboardHolder {
  return {
    id: h.id,
    label: h.label,
    color: h.color,
    initials: h.initials,
    displayOrder: h.displayOrder,
    total: 0,
    change: null,
    accounts: [],
  }
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
