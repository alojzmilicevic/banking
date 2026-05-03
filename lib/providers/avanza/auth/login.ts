// Username + password + TOTP login against Avanza's two-step
// authentication endpoints. Used both at link time (when the user first
// enters their creds) and at sync time (to silently re-auth when the
// session jar has expired). Shape was reverse-engineered via
// scripts/probe-avanza-login.ts:
//
//   1. POST /_api/authentication/sessions/usercredentials
//      body:    { username, password, maxInactiveMinutes }
//      → 200    { twoFactorLogin: { method: 'TOTP', transactionId } }
//      → cookie AZAMFATRANSACTION=<transactionId>
//   2. POST /_api/authentication/sessions/totp
//      cookie:  AZAMFATRANSACTION=<transactionId>
//      body:    { method: 'TOTP', totpCode }
//      → 200    { authenticationSession, customerId, ... }
//      → cookie csid, cstoken, AZACSRF  ← these authenticate /_api/* calls

import { BASE, paths } from '../constants'
import { generateTotp } from './totp'
import { NetworkError } from '@/lib/sync/errors'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const COMMON_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent': UA,
  Origin: 'https://www.avanza.se',
  Referer: 'https://www.avanza.se/',
  'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8',
}

// What we persist for an Avanza connection. The cookie jar is the live
// session token; the other three are the long-lived secrets that let
// sync.ts re-auth headlessly when the jar expires.
export interface AvanzaCredentials {
  cookies: Record<string, string>
  username: string
  password: string
  totpSeed: string
}

export interface LoginResult {
  cookies: Record<string, string>
  authenticationSession?: string
  customerId?: string
}

export class AvanzaLoginError extends Error {
  readonly stage: 'usercredentials' | 'totp'
  readonly status: number
  constructor(stage: 'usercredentials' | 'totp', status: number, message: string) {
    super(message)
    this.name = 'AvanzaLoginError'
    this.stage = stage
    this.status = status
  }
}

function getSetCookies(headers: Headers): string[] {
  return typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
}

function parseCookieJar(setCookies: string[]): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const sc of setCookies) {
    const pair = sc.split(';', 1)[0]
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name) continue
    if (value === '') delete jar[name]
    else jar[name] = value
  }
  return jar
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function loginWithPassword(
  username: string,
  password: string,
  totpSeed: string,
): Promise<LoginResult> {
  let credRes: Response
  try {
    credRes = await fetch(`${BASE}${paths.USERCREDENTIALS}`, {
      method: 'POST',
      headers: COMMON_HEADERS,
      body: JSON.stringify({ username, password, maxInactiveMinutes: 60 * 24 }),
      redirect: 'manual',
    })
  } catch (e) {
    throw new NetworkError(`Avanza usercredentials: ${(e as Error).message}`, { cause: e })
  }

  const credBody = await readJsonBody(credRes)

  if (!credRes.ok) {
    throw new AvanzaLoginError(
      'usercredentials',
      credRes.status,
      typeof credBody.message === 'string'
        ? credBody.message
        : `usercredentials returned ${credRes.status}`,
    )
  }

  const twoFactor = credBody.twoFactorLogin as { transactionId?: string } | undefined
  const transactionId = twoFactor?.transactionId
  if (!transactionId) {
    throw new AvanzaLoginError(
      'usercredentials',
      credRes.status,
      'No 2FA challenge returned. Check that your account has TOTP 2FA enabled.',
    )
  }

  const code = generateTotp(totpSeed)
  let totpRes: Response
  try {
    totpRes = await fetch(`${BASE}${paths.TOTP}`, {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        Cookie: `AZAMFATRANSACTION=${transactionId}`,
      },
      body: JSON.stringify({ method: 'TOTP', totpCode: code }),
      redirect: 'manual',
    })
  } catch (e) {
    throw new NetworkError(`Avanza totp: ${(e as Error).message}`, { cause: e })
  }

  const totpBody = await readJsonBody(totpRes)

  if (!totpRes.ok) {
    throw new AvanzaLoginError(
      'totp',
      totpRes.status,
      typeof totpBody.message === 'string'
        ? totpBody.message
        : `totp returned ${totpRes.status} (likely wrong TOTP seed or stale code)`,
    )
  }

  const cookies = parseCookieJar(getSetCookies(totpRes.headers))
  const required = ['csid', 'cstoken', 'AZACSRF']
  const missing = required.filter((k) => !cookies[k])
  if (missing.length > 0) {
    throw new AvanzaLoginError(
      'totp',
      totpRes.status,
      `Login succeeded but auth cookies missing: ${missing.join(', ')}`,
    )
  }

  return {
    cookies,
    authenticationSession:
      typeof totpBody.authenticationSession === 'string'
        ? totpBody.authenticationSession
        : undefined,
    customerId:
      typeof totpBody.customerId === 'string' ? totpBody.customerId : undefined,
  }
}
