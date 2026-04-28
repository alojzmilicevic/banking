// BankID auth flow (v2, QR-code based).
//
// 1. POST /_api/authentication/v2/sessions/bankid
//    body { method: 'QR_START', returnScheme: 'NULL' }
//    → { transactionId, expires, qrToken } + cookie jar updates
// 2. POST /_api/authentication/v2/sessions/bankid/{transactionId}  (empty body)
//    → { state, hint, rfa, qrToken? }    poll until state === 'COMPLETE'
// 3. GET <login.loginPath>     (login from collect response when COMPLETE)
//    → headers: X-SecurityToken
//    → body:    { authenticationSession, customerId, ... }
//
// Each step accumulates cookies onto the jar — Avanza's /_api/* endpoints
// rely on the full set being present for authentication. The orchestrator
// in ./index.ts threads the cookies through across HTTP requests by
// serializing them into the auth_states.payload row.

import { AvanzaApi, type AvanzaSession } from '../api'
import { paths } from '../constants'

type Cookies = Record<string, string>

export interface BankIdInitResult {
  transactionId: string
  expires: string
  qrToken: string
  cookies: Cookies
}

export interface BankIdCollectLogin {
  customerId: string
  username: string
  loginPath: string
  accounts?: Array<{ accountName: string; accountType: string }>
}

export interface BankIdCollectResult {
  state: string
  transactionId: string
  hint?: string
  rfa?: string
  qrToken?: string
  logins?: BankIdCollectLogin[]
  errorMessage?: string
  cookies: Cookies
}

export async function bankidInitiate(): Promise<BankIdInitResult> {
  const api = new AvanzaApi()
  const body = await api.post<Omit<BankIdInitResult, 'cookies'>>(paths.BANKID_V2_INITIATE, {
    method: 'QR_START',
    returnScheme: 'NULL',
  })
  if (!body.transactionId || !body.qrToken) {
    throw new Error(`Avanza BankID init: unexpected response ${JSON.stringify(body)}`)
  }
  return { ...body, cookies: api.cookieMap() }
}

export async function bankidCollect(
  transactionId: string,
  cookies: Cookies,
): Promise<BankIdCollectResult> {
  const api = new AvanzaApi()
  for (const [k, v] of Object.entries(cookies)) api.setCookie(k, v)
  const body = await api.post<Omit<BankIdCollectResult, 'cookies'>>(
    paths.BANKID_V2_COLLECT.replace('{transactionId}', encodeURIComponent(transactionId)),
  )
  return { ...body, cookies: api.cookieMap() }
}

export async function bankidFinalize(
  login: BankIdCollectLogin,
  cookies: Cookies,
): Promise<AvanzaSession> {
  const api = new AvanzaApi()
  for (const [k, v] of Object.entries(cookies)) api.setCookie(k, v)
  const { headers, body } = await api.raw<{
    authenticationSession: string
    pushSubscriptionId?: string
    customerId: string
    registrationComplete?: boolean
  }>('GET', login.loginPath)

  const securityToken = headers.get('x-securitytoken')
  if (!securityToken) {
    throw new Error('Avanza BankID finalize: server did not return X-SecurityToken')
  }
  if (!body.authenticationSession) {
    throw new Error('Avanza BankID finalize: server did not return authenticationSession')
  }

  return {
    securityToken,
    authenticationSession: body.authenticationSession,
    customerId: body.customerId ?? login.customerId,
    pushSubscriptionId: body.pushSubscriptionId,
    cookies: api.cookieMap(),
    expiresAt: Date.now() + 55 * 60 * 1000,
  }
}
