// EB → normalized translations for the sync orchestrator.

import crypto from 'node:crypto'
import { eb, type EBAccount, type EBBalance, type EBTransaction } from './api'
import type {
  AccountKind,
  ConnectionContext,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
  SyncOptions,
  SyncResult,
  TransactionKind,
} from '../types'

function signedAmount(t: EBTransaction): number {
  const raw = parseFloat(t.transaction_amount.amount)
  if (!Number.isFinite(raw)) return 0
  if (t.credit_debit_indicator === 'DBIT') return -Math.abs(raw)
  if (t.credit_debit_indicator === 'CRDT') return Math.abs(raw)
  return raw
}

function txDate(t: EBTransaction): string | null {
  return t.booking_date || t.value_date || t.transaction_date || null
}

function fingerprint(accountId: string, t: EBTransaction): string {
  if (t.transaction_id) return `id:${t.transaction_id}`
  if (t.entry_reference) return `ref:${t.entry_reference}`
  const date = txDate(t) ?? ''
  const desc = (t.remittance_information ?? []).join('|')
  const cp = t.creditor?.name ?? t.debtor?.name ?? ''
  const sig = `${date}|${t.transaction_amount.amount}|${t.credit_debit_indicator ?? ''}|${desc}|${cp}`
  const hash = crypto.createHash('sha256').update(`${accountId}|${sig}`).digest('hex').slice(0, 24)
  return `h:${hash}`
}

// Map an EB cash_account_type code to our normalized AccountKind.
function ebKind(_a: EBAccount): AccountKind {
  // EB returns CACC, CARD, etc. For now everything is 'cash' (we'd handle
  // CARD separately later for credit cards with revolving balances).
  return 'cash'
}

function classifyTransaction(amount: number): TransactionKind {
  if (amount >= 0) return 'cash_in'
  return 'cash_out'
}

function normalizeAccount(a: EBAccount): NormalizedAccount {
  return {
    id: a.uid,
    kind: ebKind(a),
    name: a.name ?? null,
    details: a.details ?? null,
    product: a.product ?? null,
    accountType: a.cash_account_type ?? null,
    currency: a.currency ?? null,
    iban: a.account_id?.iban ?? null,
    bban: a.account_id?.bban ?? a.account_id?.other?.identification ?? null,
    bic: a.account_servicer?.bic_fi ?? null,
    raw: a,
  }
}

function normalizeBalance(accountId: string, b: EBBalance): NormalizedBalance {
  return {
    accountId,
    balanceType: b.balance_type,
    amount: parseFloat(b.balance_amount.amount),
    currency: b.balance_amount.currency,
    referenceDate: b.reference_date ?? null,
    raw: b,
  }
}

function normalizeTransaction(accountId: string, t: EBTransaction): NormalizedTransaction | null {
  const date = txDate(t)
  if (!date) return null
  const amount = signedAmount(t)
  return {
    accountId,
    fingerprint: fingerprint(accountId, t),
    date,
    kind: classifyTransaction(amount),
    amount,
    currency: t.transaction_amount.currency,
    status: t.status ?? null,
    description: (t.remittance_information ?? []).join(' ') || null,
    counterparty: t.creditor?.name ?? t.debtor?.name ?? null,
    raw: t,
  }
}

export async function ebSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  const session = await eb.getSession(connection.externalId)
  // Both `accounts` (string[]) and `accounts_data` (sparse objects) reference
  // the same uids — dedupe.
  const uidsFromData = (session.accounts_data ?? []).map((a) => a.uid)
  const uidsFromList = (session.accounts as Array<EBAccount | string>).map((a) =>
    typeof a === 'string' ? a : a.uid,
  )
  const accountUids = Array.from(new Set([...uidsFromData, ...uidsFromList]))

  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)

  // GET /sessions returns sparse account stubs; rich fields live behind
  // /accounts/{uid}/details. Fan out per account in parallel.
  const perAccount = await Promise.all(
    accountUids.map(async (uid) => {
      const [details, balResp, txResp] = await Promise.all([
        eb.getAccountDetails(uid),
        eb.getBalances(uid),
        eb.getTransactions(uid, { dateFrom, dateTo }),
      ])
      const fullAccount: EBAccount = { ...details, uid }
      return { uid, fullAccount, balResp, txResp }
    }),
  )

  const accounts = perAccount.map((r) => normalizeAccount(r.fullAccount))
  const balances: NormalizedBalance[] = []
  const transactions: NormalizedTransaction[] = []

  for (const { uid, balResp, txResp } of perAccount) {
    for (const b of balResp.balances) balances.push(normalizeBalance(uid, b))
    for (const t of txResp.transactions) {
      const n = normalizeTransaction(uid, t)
      if (n) transactions.push(n)
    }
  }

  return { accounts, balances, transactions, syncWindow: { from: dateFrom, to: dateTo } }
}
