// Low-level Enable Banking HTTP client + JWT auth. Provider-agnostic types
// live in ../types; everything here is EB-specific.

import { createPrivateKey, createSign, type KeyObject } from 'node:crypto'
import fs from 'node:fs'
import {
  AuthExpiredError,
  NetworkError,
  ProviderRegressionError,
  RateLimitedError,
} from '@/lib/sync/errors'

const BASE = 'https://api.enablebanking.com'

let cachedKey: KeyObject | null = null
function getPrivateKey(): KeyObject {
  if (cachedKey) return cachedKey
  const inline = process.env.EB_PRIVATE_KEY
  const path = process.env.EB_PRIVATE_KEY_PATH
  let pem: string | undefined
  if (inline && inline.includes('BEGIN')) pem = inline.replace(/\\n/g, '\n')
  else if (path) pem = fs.readFileSync(path, 'utf8')
  if (!pem) throw new Error('Set EB_PRIVATE_KEY or EB_PRIVATE_KEY_PATH')
  cachedKey = createPrivateKey(pem)
  return cachedKey
}

let cachedJwt: { token: string; expiresAt: number } | null = null

function signJwt(): string {
  if (cachedJwt && cachedJwt.expiresAt > Date.now() + 60_000) return cachedJwt.token
  const appId = process.env.EB_APPLICATION_ID
  if (!appId) throw new Error('Missing EB_APPLICATION_ID')
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600
  const header = { typ: 'JWT', alg: 'RS256', kid: appId }
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp }
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${enc(header)}.${enc(payload)}`
  const sig = createSign('RSA-SHA256').update(signingInput).end().sign(getPrivateKey()).toString('base64url')
  const token = `${signingInput}.${sig}`
  cachedJwt = { token, expiresAt: exp * 1000 }
  return token
}

export async function ebFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${signJwt()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  } catch (e) {
    throw new NetworkError(`EB ${path}: ${(e as Error).message}`, { cause: e })
  }
  if (!res.ok) {
    const body = await res.text()
    const summary = `EB ${path} ${res.status}: ${body}`
    if (res.status === 401 || res.status === 403) throw new AuthExpiredError(summary)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'))
      throw new RateLimitedError(summary, {
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
      })
    }
    if (res.status >= 500) throw new ProviderRegressionError(summary)
    throw new Error(summary)
  }
  return res.json() as Promise<T>
}

// EB response shapes (just the fields we care about).
export interface EBAuthMethod {
  name: string
  title?: string
  psu_type?: 'personal' | 'business'
}

export interface EBASPSP {
  name: string
  country: string
  logo?: string
  psu_types?: ('personal' | 'business')[]
  auth_methods?: EBAuthMethod[]
  maximum_consent_validity?: number
  beta?: boolean
  bic?: string
}

export interface EBAccountIdentifier {
  iban?: string | null
  bban?: string | null
  other?: { identification: string; scheme_name?: string } | null
}

export interface EBAccount {
  uid: string
  identification_hash?: string
  account_id?: EBAccountIdentifier
  account_servicer?: { bic_fi?: string | null }
  name?: string | null
  details?: string | null
  product?: string | null
  cash_account_type?: string | null
  currency?: string | null
}

export interface EBBalance {
  name?: string
  balance_amount: { amount: string; currency: string }
  balance_type: string
  reference_date?: string
}

export interface EBTransaction {
  entry_reference?: string | null
  transaction_id?: string | null
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  transaction_amount: { amount: string; currency: string }
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  remittance_information?: string[] | null
  status?: string | null
  credit_debit_indicator?: 'DBIT' | 'CRDT' | null
  bank_transaction_code?: string | null
}

// POST /sessions (code exchange): full objects in `accounts`.
// GET /sessions/{id}: uid strings in `accounts`, full objects in `accounts_data`.
export interface EBSession {
  session_id?: string
  accounts: (EBAccount | string)[]
  accounts_data?: EBAccount[]
  aspsp: { name: string; country: string }
  psu_type: string
  access: { valid_until: string }
  status?: string
}

export interface EBAuthResponse {
  url: string
  authorization_id: string
}

export const eb = {
  listASPSPs: (country: string) =>
    ebFetch<{ aspsps: EBASPSP[] }>(`/aspsps?country=${country}`).then((r) => r.aspsps),

  startAuth: (opts: {
    aspspName: string
    aspspCountry: string
    redirectUrl: string
    state: string
    validUntil: string
    psuType?: 'personal' | 'business'
    authMethod?: string
  }) =>
    ebFetch<EBAuthResponse>('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: opts.validUntil },
        aspsp: { name: opts.aspspName, country: opts.aspspCountry },
        state: opts.state,
        redirect_url: opts.redirectUrl,
        psu_type: opts.psuType ?? 'personal',
        ...(opts.authMethod ? { auth_method: opts.authMethod } : {}),
      }),
    }),

  exchangeCode: (code: string) =>
    ebFetch<EBSession>('/sessions', { method: 'POST', body: JSON.stringify({ code }) }),

  getSession: (id: string) => ebFetch<EBSession>(`/sessions/${id}`),

  getAccountDetails: (accountUid: string) =>
    ebFetch<EBAccount>(`/accounts/${accountUid}/details`),

  getBalances: (accountUid: string) =>
    ebFetch<{ balances: EBBalance[] }>(`/accounts/${accountUid}/balances`),

  getTransactions: (
    accountUid: string,
    opts?: { dateFrom?: string; dateTo?: string },
  ) => {
    const qs = new URLSearchParams()
    if (opts?.dateFrom) qs.set('date_from', opts.dateFrom)
    if (opts?.dateTo) qs.set('date_to', opts.dateTo)
    const tail = qs.toString() ? `?${qs}` : ''
    return ebFetch<{ transactions: EBTransaction[]; continuation_key?: string }>(
      `/accounts/${accountUid}/transactions${tail}`,
    )
  },
}
