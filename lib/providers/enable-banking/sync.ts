// EB → normalized translations for the sync orchestrator.

import crypto from 'node:crypto'
import { eb, type EBAccount, type EBBalance, type EBTransaction } from './api'
import type {
  ConnectionContext,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
  SyncOptions,
  SyncResult,
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

// Stable dedup key. Survives pending → booked transitions when a stable id is
// available; falls back to a deterministic content hash otherwise.
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

function normalizeAccount(connectionExternalId: string, a: EBAccount): NormalizedAccount {
  return {
    id: a.uid,
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
  return {
    accountId,
    fingerprint: fingerprint(accountId, t),
    date,
    amount: signedAmount(t),
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
  // Always fetch the current session from EB so we get the up-to-date account
  // list. Account uids are stable.
  // GET /sessions/{id} returns: accounts: string[] (uids), accounts_data: EBAccount[]
  // POST /sessions (during auth) returns: accounts: EBAccount[]
  // GET /sessions/{id} returns minimal accounts_data (just uids + hashes).
  // Rich info — name, details (alias), product, iban, etc. — lives behind
  // GET /accounts/{uid}/details. So we have to fan out an extra call per
  // account to assemble normalized account rows.
  const session = await eb.getSession(connection.externalId)
  // GET /sessions returns the same uids in both `accounts` (string[]) and
  // `accounts_data` (objects). Dedupe.
  const uidsFromData = (session.accounts_data ?? []).map((a) => a.uid)
  const uidsFromList = (session.accounts as Array<EBAccount | string>).map((a) =>
    typeof a === 'string' ? a : a.uid,
  )
  const accountUids = Array.from(new Set([...uidsFromData, ...uidsFromList]))

  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)

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

  const accounts = perAccount.map((r) =>
    normalizeAccount(connection.externalId, r.fullAccount),
  )

  const balances: NormalizedBalance[] = []
  const transactions: NormalizedTransaction[] = []

  for (const { uid, balResp, txResp } of perAccount) {
    for (const b of balResp.balances) balances.push(normalizeBalance(uid, b))
    for (const t of txResp.transactions) {
      const n = normalizeTransaction(uid, t)
      if (n) transactions.push(n)
    }
  }

  return {
    accounts,
    balances,
    transactions,
    syncWindow: { from: dateFrom, to: dateTo },
  }
}
