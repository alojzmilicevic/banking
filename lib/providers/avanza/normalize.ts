// Pure mapping from Avanza API shapes → our normalized types. Kept apart
// from sync.ts so it's testable without fetching anything.

import crypto from 'node:crypto'
import { ACCOUNT_TYPE_KIND } from './constants'
import type {
  AccountKind,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedInstrument,
  NormalizedPosition,
  NormalizedTransaction,
  TransactionKind,
} from '../types'

// ── Avanza response shapes (just what we use) ────────────────────────────

export interface AvanzaOverviewAccount {
  accountId: string
  accountType: string
  accountTypeName?: string
  name?: string
  totalBalance?: number
  totalProfit?: number
  totalProfitPercent?: number
  ownCapital?: number
  buyingPower?: number
  courtage?: number
  ownerName?: string
  currency?: string
  errorStatus?: string | null
}

export interface AvanzaOverview {
  accounts: AvanzaOverviewAccount[]
  totalBalance?: number
  totalOwnCapital?: number
  totalBuyingPower?: number
}

export interface AvanzaPosition {
  accountId: string
  accountName?: string
  accountType?: string
  name?: string
  orderbookId?: string
  isin?: string
  currency?: string
  volume?: number
  averageAcquiredPrice?: number
  currentValue?: number
  lastPrice?: number
  tradable?: boolean
}

export interface AvanzaInstrumentPositions {
  instrumentType: string
  positions: AvanzaPosition[]
}

export interface AvanzaCashOnAccount {
  accountId: string
  accountName?: string
  totalBalance?: number
  currency?: string
}

export interface AvanzaPositionsResponse {
  instrumentPositions: AvanzaInstrumentPositions[]
  cashOnAccounts?: AvanzaCashOnAccount[]
  totalBalance?: number
  totalOwnCapital?: number
}

export interface AvanzaTransaction {
  id?: string
  noteId?: string
  verificationDate?: string
  transactionDate?: string
  type?: string
  amount?: number
  currency?: string
  description?: string
  account?: { id: string; name?: string; type?: string }
  orderbook?: {
    id?: string
    name?: string
    isin?: string
    currency?: string
    type?: string
  }
  volume?: number
  price?: number
  commission?: number
}

export interface AvanzaTransactionsResponse {
  transactions: AvanzaTransaction[]
}

// ── Mapping helpers ──────────────────────────────────────────────────────

function accountKind(code: string | undefined): AccountKind {
  if (!code) return 'cash'
  return ACCOUNT_TYPE_KIND[code] ?? 'investment'
}

// Avanza tx type → our normalized kind. Defensive: anything we don't know
// becomes 'other' so the row still lands.
const TX_KIND_MAP: Record<string, TransactionKind> = {
  BUY: 'buy',
  SELL: 'sell',
  DIVIDEND: 'dividend',
  INTEREST: 'interest',
  DEPOSIT: 'cash_in',
  WITHDRAW: 'cash_out',
  WITHDRAWAL: 'cash_out',
  TRANSFER: 'transfer_in', // sign decides direction below
  FEE: 'fee',
  TAX: 'tax',
  FOREIGN_TAX: 'tax',
  FOREX: 'fx',
  OPTIONS: 'other',
}

function txKind(t: AvanzaTransaction): TransactionKind {
  const raw = (t.type ?? '').toUpperCase()
  const base = TX_KIND_MAP[raw] ?? 'other'
  if (base === 'transfer_in' && (t.amount ?? 0) < 0) return 'transfer_out'
  return base
}

function instrumentId(
  source: AvanzaTransaction['orderbook'] | AvanzaPosition | null | undefined,
): string | null {
  if (!source) return null
  if ('isin' in source && source.isin) return source.isin
  const id =
    'orderbookId' in source ? source.orderbookId : 'id' in source ? source.id : undefined
  return id ? `avanza:${id}` : null
}

function fingerprint(accountId: string, t: AvanzaTransaction): string {
  if (t.id) return `id:${t.id}`
  if (t.noteId) return `note:${t.noteId}`
  const date = t.verificationDate ?? t.transactionDate ?? ''
  const ob = t.orderbook?.id ?? ''
  const sig = `${date}|${t.type ?? ''}|${t.amount ?? ''}|${ob}|${t.description ?? ''}`
  const hash = crypto.createHash('sha256').update(`${accountId}|${sig}`).digest('hex').slice(0, 24)
  return `h:${hash}`
}

// ── Public normalizers ───────────────────────────────────────────────────

export function normalizeAccount(a: AvanzaOverviewAccount): NormalizedAccount {
  return {
    id: a.accountId,
    kind: accountKind(a.accountType),
    name: a.ownerName ?? null,
    details: a.name ?? null,
    product: a.accountTypeName ?? a.accountType ?? null,
    accountType: a.accountType ?? null,
    currency: a.currency ?? 'SEK',
    raw: a,
  }
}

// Avanza's overview gives us ownCapital (cash + securities) per account, and
// the positions endpoint gives us cashOnAccounts. We expose both as
// "balances" with different balance_types so the read layer can pick.
export function normalizeBalances(
  overview: AvanzaOverview,
  positions: AvanzaPositionsResponse,
): NormalizedBalance[] {
  const out: NormalizedBalance[] = []

  for (const a of overview.accounts) {
    if (typeof a.totalBalance === 'number') {
      out.push({
        accountId: a.accountId,
        balanceType: 'totalBalance', // cash + securities
        amount: a.totalBalance,
        currency: a.currency ?? 'SEK',
        referenceDate: null,
        raw: a,
      })
    }
    if (typeof a.ownCapital === 'number') {
      out.push({
        accountId: a.accountId,
        balanceType: 'ownCapital',
        amount: a.ownCapital,
        currency: a.currency ?? 'SEK',
        referenceDate: null,
        raw: a,
      })
    }
  }

  for (const c of positions.cashOnAccounts ?? []) {
    if (typeof c.totalBalance === 'number') {
      out.push({
        accountId: c.accountId,
        balanceType: 'cash',
        amount: c.totalBalance,
        currency: c.currency ?? 'SEK',
        referenceDate: null,
        raw: c,
      })
    }
  }

  return out
}

export function normalizePositionsAndInstruments(
  resp: AvanzaPositionsResponse,
): { positions: NormalizedPosition[]; instruments: NormalizedInstrument[] } {
  const positions: NormalizedPosition[] = []
  const instruments = new Map<string, NormalizedInstrument>()

  for (const group of resp.instrumentPositions ?? []) {
    for (const p of group.positions ?? []) {
      const id = instrumentId(p)
      if (!id) continue

      if (!instruments.has(id)) {
        instruments.set(id, {
          id,
          type: group.instrumentType,
          name: p.name ?? null,
          ticker: null,
          currency: p.currency ?? 'SEK',
          isin: p.isin ?? null,
          providerId: 'avanza',
          providerInstrumentId: p.orderbookId ?? null,
          raw: p,
        })
      }

      positions.push({
        accountId: p.accountId,
        instrumentId: id,
        quantity: p.volume ?? 0,
        avgCost: p.averageAcquiredPrice ?? null,
        marketValue: p.currentValue ?? null,
        currency: p.currency ?? 'SEK',
        raw: p,
      })
    }
  }

  return { positions, instruments: Array.from(instruments.values()) }
}

export function normalizeTransaction(t: AvanzaTransaction): {
  transaction: NormalizedTransaction | null
  instrument: NormalizedInstrument | null
} {
  const date = t.verificationDate ?? t.transactionDate
  const accountId = t.account?.id
  if (!date || !accountId) return { transaction: null, instrument: null }

  const instId = instrumentId(t.orderbook)

  const instrument: NormalizedInstrument | null = instId
    ? {
        id: instId,
        type: t.orderbook?.type ?? 'UNKNOWN',
        name: t.orderbook?.name ?? null,
        ticker: null,
        currency: t.orderbook?.currency ?? null,
        isin: t.orderbook?.isin ?? null,
        providerId: 'avanza',
        providerInstrumentId: t.orderbook?.id ?? null,
        raw: t.orderbook,
      }
    : null

  return {
    transaction: {
      accountId,
      fingerprint: fingerprint(accountId, t),
      date,
      kind: txKind(t),
      amount: typeof t.amount === 'number' ? t.amount : 0,
      currency: t.currency ?? 'SEK',
      instrumentId: instId,
      quantity: typeof t.volume === 'number' ? t.volume : null,
      status: null,
      description: t.description ?? null,
      counterparty: null,
      raw: t,
    },
    instrument,
  }
}
