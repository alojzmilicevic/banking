// BankID auth flow.
//
// 1. POST /_api/authentication/sessions/bankid       { identificationNumber }
//    → { transactionId, expires, autostartToken }
// 2. GET  /_api/authentication/sessions/bankid/collect  Cookie: AZAMFATRANSACTION=<tid>
//    → poll every ~2s until state === 'COMPLETE'
// 3. GET  <login.loginPath>                              (returned by step 2)
//    → headers: X-SecurityToken
//    → body:    { authenticationSession, customerId, pushSubscriptionId }
//
// Result is the same session shape we'd get from password+TOTP — every
// subsequent API call uses these tokens.

import { AvanzaApi, type AvanzaSession } from '../api'
import { paths } from '../constants'

export interface BankIdInitiateResult {
  transactionId: string
  expires: string // ISO datetime
  autostartToken: string
}

export interface BankIdLogin {
  customerId: string
  username: string
  loginPath: string
  accounts?: Array<{ accountName: string; accountType: string }>
}

export interface BankIdCollectResult {
  state: string // OUTSTANDING_TRANSACTION | USER_SIGN | COMPLETE | FAILED | EXPIRED | ...
  transactionId: string
  name?: string
  logins?: BankIdLogin[]
  hintCode?: string // e.g. outstandingTransaction, userSign, started
  errorMessage?: string
}

export async function bankidInitiate(personnummer: string): Promise<BankIdInitiateResult> {
  const api = new AvanzaApi()
  const body = await api.post<BankIdInitiateResult>(paths.BANKID_INITIATE, {
    identificationNumber: personnummer,
  })
  if (!body.transactionId) throw new Error('Avanza BankID initiate: missing transactionId')
  return body
}

export async function bankidCollect(transactionId: string): Promise<BankIdCollectResult> {
  const api = new AvanzaApi()
  api.setCookie('AZAMFATRANSACTION', transactionId)
  return api.get<BankIdCollectResult>(paths.BANKID_COLLECT)
}

// Final step after BankID returns COMPLETE — picks a login and fetches the
// session tokens. By default takes the first login; the caller can pre-pick
// by username if there are multiple Avanza accounts on the same personnummer.
export async function bankidFinalize(login: BankIdLogin): Promise<AvanzaSession> {
  const api = new AvanzaApi()
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
    expiresAt: Date.now() + 55 * 60 * 1000, // generous: re-auth before 60 min idle
  }
}
