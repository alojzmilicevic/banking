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

// Merge Set-Cookie headers into an existing jar. Used to accumulate
// cookies across the usercredentials + totp two-step login: a real
// browser carries cookies from the first response into the second
// request and persists the union, so we do the same. Discarding the
// usercredentials response's cookies (the previous behaviour) left the
// final jar with only `csid`/`cstoken`/`AZACSRF` from the totp step;
// `/_api/account-overview/*` then 401'd because the persistence
// cookies set on usercredentials were missing.
function mergeSetCookies(jar: Record<string, string>, setCookies: string[]): void {
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
}

function jarHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
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

// Map a non-OK response to a safe, user-facing label. The raw upstream
// `message` is logged server-side but never forwarded to the client — a
// future Avanza change could echo back the submitted username (or other
// inputs) and we don't want that landing in the browser network tab.
function safeMessageForStatus(stage: 'usercredentials' | 'totp', status: number): string {
  if (status === 401 || status === 403) {
    return stage === 'usercredentials'
      ? 'Avanza rejected the username or password.'
      : 'Avanza rejected the TOTP code — check the seed and clock skew.'
  }
  if (status === 429) return 'Avanza rate-limited the login — try again in a few minutes.'
  if (status >= 500) return 'Avanza is having trouble responding — try again shortly.'
  return `Avanza login failed (${stage} returned ${status}).`
}

export async function loginWithPassword(
  username: string,
  password: string,
  totpSeed: string,
): Promise<LoginResult> {
  // Single jar carried across both auth hops. The usercredentials
  // response sets persistence/session cookies (e.g. AZAPERSISTENCE,
  // AZAHLI) that the totp step doesn't re-emit but that the new
  // /_api/account-overview/* endpoints require. A browser carries them
  // forward implicitly; we have to do it explicitly.
  const jar: Record<string, string> = {}

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

  mergeSetCookies(jar, getSetCookies(credRes.headers))

  const credBody = await readJsonBody(credRes)

  if (!credRes.ok) {
    if (typeof credBody.message === 'string') {
      console.warn(
        `[avanza] usercredentials ${credRes.status}: ${credBody.message}`,
      )
    }
    throw new AvanzaLoginError(
      'usercredentials',
      credRes.status,
      safeMessageForStatus('usercredentials', credRes.status),
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

  // Force-set AZAMFATRANSACTION from the response body. Set-Cookie may
  // already have set it, but the body is the canonical source — if
  // Avanza ever drops the Set-Cookie this still works.
  jar['AZAMFATRANSACTION'] = transactionId

  const code = generateTotp(totpSeed)
  let totpRes: Response
  try {
    totpRes = await fetch(`${BASE}${paths.TOTP}`, {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        Cookie: jarHeader(jar),
      },
      body: JSON.stringify({ method: 'TOTP', totpCode: code }),
      redirect: 'manual',
    })
  } catch (e) {
    throw new NetworkError(`Avanza totp: ${(e as Error).message}`, { cause: e })
  }

  mergeSetCookies(jar, getSetCookies(totpRes.headers))

  const totpBody = await readJsonBody(totpRes)

  if (!totpRes.ok) {
    if (typeof totpBody.message === 'string') {
      console.warn(`[avanza] totp ${totpRes.status}: ${totpBody.message}`)
    }
    throw new AvanzaLoginError(
      'totp',
      totpRes.status,
      safeMessageForStatus('totp', totpRes.status),
    )
  }

  // Drop the now-consumed 2FA transaction marker before persisting.
  delete jar['AZAMFATRANSACTION']

  const required = ['csid', 'cstoken', 'AZACSRF']
  const missing = required.filter((k) => !jar[k])
  if (missing.length > 0) {
    throw new AvanzaLoginError(
      'totp',
      totpRes.status,
      `Login succeeded but auth cookies missing: ${missing.join(', ')}`,
    )
  }

  return { cookies: jar }
}
