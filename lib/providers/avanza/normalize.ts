// Pure mapping from Avanza API shapes → our normalized types. Kept apart
// from sync.ts so it's testable without fetching anything.

import { ACCOUNT_TYPE_KIND } from './constants'
import type {
  AccountKind,
  NormalizedAccount,
  NormalizedBalance,
} from '../types'

// ── /_api/account-overview/overview/categorizedAccounts shape ──────────

export interface AvanzaMoney {
  value: number
  unit: string
  unitType: string
  decimalPrecision: number
}

export interface AvanzaAccountName {
  defaultName: string
  userDefinedName: string | null
}

export interface AvanzaCategorizedAccount {
  id: string
  urlParameterId: string
  clearingAccountNumber?: string | null
  type: string // AKTIEFONDKONTO | INVESTERINGSSPARKONTO | …
  categoryId?: string | null // built-in: SPARANDE, INVESTERING, …
  status?: string
  errorStatus?: string
  name: AvanzaAccountName
  owner?: boolean
  balance: AvanzaMoney // cash component
  totalValue: AvanzaMoney // cash + securities
  buyingPower?: AvanzaMoney
  buyingPowerWithoutCredit?: AvanzaMoney
  credit?: AvanzaMoney | null
  currencyBalances?: AvanzaMoney[]
  performance?: Record<string, { absolute: AvanzaMoney; relative: AvanzaMoney }>
  profit?: { absolute: AvanzaMoney; relative: AvanzaMoney }
  settings?: { IS_HIDDEN?: boolean }
}

export interface AvanzaCategory {
  id: string
  name: string
  totalValue: AvanzaMoney
  performance?: Record<string, { absolute: AvanzaMoney; relative: AvanzaMoney }>
  savingsGoalView?: { goalAmount: number; percentCompleted: number; sharedGoal: boolean }
}

export interface AvanzaCategorizedAccountsResponse {
  accounts: AvanzaCategorizedAccount[]
  categories: AvanzaCategory[]
  loans: unknown[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function accountKind(code: string | undefined): AccountKind {
  if (!code) return 'cash'
  return ACCOUNT_TYPE_KIND[code] ?? 'investment'
}

function bestName(n: AvanzaAccountName): string {
  return n.userDefinedName?.trim() || n.defaultName
}

// ── Normalizers ──────────────────────────────────────────────────────────

export function normalizeAccount(a: AvanzaCategorizedAccount): NormalizedAccount {
  const cur = a.balance?.unit ?? 'SEK'
  return {
    id: a.id,
    kind: accountKind(a.type),
    name: null, // holder name not present in this response
    details: bestName(a.name),
    product: a.type,
    accountType: a.type,
    currency: cur,
    iban: null,
    bban: a.clearingAccountNumber ?? null,
    bic: null,
    raw: a,
  }
}

// Avanza gives both `balance` (cash) and `totalValue` (cash + securities).
// We expose both as balance rows with distinct types so the snapshot picker
// can choose. `totalValue` already includes investments — flagged via the
// special balance_type so snapshots.ts knows not to double-count by adding
// positions on top.
export function normalizeBalances(a: AvanzaCategorizedAccount): NormalizedBalance[] {
  const out: NormalizedBalance[] = []
  if (typeof a.balance?.value === 'number') {
    out.push({
      accountId: a.id,
      balanceType: 'cash',
      amount: a.balance.value,
      currency: a.balance.unit ?? 'SEK',
      referenceDate: null,
      raw: a.balance,
    })
  }
  if (typeof a.totalValue?.value === 'number') {
    out.push({
      accountId: a.id,
      balanceType: 'totalBalance', // cash + securities (already aggregated)
      amount: a.totalValue.value,
      currency: a.totalValue.unit ?? 'SEK',
      referenceDate: null,
      raw: a.totalValue,
    })
  }
  return out
}
