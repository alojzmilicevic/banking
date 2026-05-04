// Dashboard view-model contract — types only, importable from both client
// and server. The implementation lives in lib/services/dashboard.ts.
//
// Server does ALL the bucketing, dedup, joint detection, change math,
// and totals so components stay dumb (iterate + render). Holders are DB
// rows, so any household size works.

import type { AccountType } from '@/lib/account-types'

// ─── Holder ──────────────────────────────────────────────────────────────

// Roster entry — what /api/holders returns. Same fields the
// AddBankModal needs to render holder chips, without the totals/accounts
// the dashboard view-model adds on top.
export interface HolderListItem {
  id: string
  label: string
  color: string
  initials: string | null
  displayOrder: number
}

export interface DashboardHolder extends HolderListItem {
  total: number
  change: ChangePill | null
  accounts: DashboardAccount[]
}

// ─── Bucket: where an account lives in the UI ────────────────────────────
//
// Mutually exclusive — server places each account in exactly one bucket.
// The FE reads `bucket` for color coding / quick lookups and iterates the
// right top-level array for layout.

export type DashboardBucket =
  | { kind: 'holder'; holderId: string }
  | { kind: 'shared' } // IBAN appears under multiple holders, or connection is explicitly shared
  | { kind: 'unassigned' } // no holder linked yet (legacy / pre-holders DB)

// ─── Account ─────────────────────────────────────────────────────────────

export interface DashboardAccount {
  id: string
  name: string | null
  details: string | null
  product: string | null
  accountType: AccountType | null
  currency: string | null
  iban: string | null
  bban: string | null
  bic: string | null
  kind: string | null // 'cash' | 'card' | 'investment' | 'pension' | null
  excludedFromTotal: boolean
  balance: number | null
  balanceCurrency: string | null
  sparkline: { date: string; value: number }[] | null
  change: ChangePill | null
  bucket: DashboardBucket
  // The secondary copy of a joint account that's also linked under another
  // holder — UI hides these so the account appears exactly once. Set on
  // the dupe; null on the canonical.
  possibleDuplicateOf: string | null
  connection: DashboardAccountConnection
}

export interface DashboardAccountConnection {
  id: string
  providerId: string
  label: string | null
  status: string
  validUntil: number | null
  lastSyncedAt: number | null
  lastSyncError: string | null
}

// ─── Shared & Unassigned buckets ─────────────────────────────────────────

export interface DashboardSharedBucket {
  total: number
  change: ChangePill | null
  accounts: DashboardAccount[]
}

export interface DashboardUnassignedBucket {
  total: number
  accounts: DashboardAccount[]
}

// ─── Top-level totals ────────────────────────────────────────────────────

export interface DashboardTotals {
  total: number
  cash: number
  investment: number
  change: ChangePill | null
}

export interface ChangePill {
  absolute: number
  // null when the math would produce a misleading number (cash account, or
  // ratio beyond ±500% from a near-zero base).
  pct: number | null
}

// ─── Top-level response ──────────────────────────────────────────────────

export interface DashboardResponse {
  // Ordered by holders.displayOrder. Empty when the user hasn't set up
  // any household members yet.
  holders: DashboardHolder[]
  // Joint accounts (auto-detected via shared IBAN, or explicitly marked).
  // Always present even when empty — the FE checks accounts.length to
  // decide whether to render the section.
  shared: DashboardSharedBucket
  // Connections that exist but have no holder assigned yet. Surfaced so
  // the user can fix them; null when there are none.
  unassigned: DashboardUnassignedBucket | null
  totals: DashboardTotals
  baseCurrency: string
  // Per-account or per-connection sync errors (currency mismatches,
  // provider regressions). UI shows these as a banner.
  errors: string[]
}

// ─── Timeseries response (separate endpoint, shares vocabulary) ──────────

export interface TimeseriesPoint {
  date: string
  total: number
  cash: number
  investment: number
  // holderId → amount on this day. Map keys are stable across the series
  // so chart `dataKey={holderId}` works directly.
  byHolder: Record<string, number>
  shared: number
  unassigned: number
}

export interface TimeseriesResponse {
  series: TimeseriesPoint[]
  // Current (today) totals — saves the FE from re-reading the last point.
  current: {
    total: number
    cash: number
    investment: number
    byHolder: Record<string, number>
    shared: number
    unassigned: number
  }
  currency: string | null
  period: string
  points: number
  errors: string[]
}
