// Thin HTTP client for Avanza's unofficial mobile API.
//
// Auth: Avanza uses **session cookies** (AZAPERSISTENCE, AZAHLI, AZACSRF, …)
// set by the BankID finalize step. The X-AuthenticationSession +
// X-SecurityToken headers from the BankID flow are also sent for
// legacy /_mobile/* endpoints. Both are kept on the AvanzaApi instance.
//
// We maintain a per-instance cookie jar so the auth flow can accumulate
// cookies across initiate → collect → finalize, and so the sync layer can
// reuse them for subsequent /_api/* requests.

import { BASE } from './constants'
import {
  AuthExpiredError,
  NetworkError,
  ProviderRegressionError,
  RateLimitedError,
} from '@/lib/sync/errors'

export interface AvanzaSession {
  // Tokens are present when the session was established via BankID. They're
  // absent for the paste-cookies fallback (the website uses cookies alone).
  securityToken?: string
  authenticationSession?: string
  customerId?: string
  pushSubscriptionId?: string
  // Cookies are the actual auth — captured from BankID finalize OR pasted
  // directly from the user's browser.
  cookies: Record<string, string>
  // Unix ms. Avanza sessions expire after ~60 min of idle.
  expiresAt: number
}

export interface AvanzaResponse<T> {
  status: number
  body: T
  headers: Headers
  setCookies: string[]
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

export class AvanzaApi {
  private session: AvanzaSession | null
  private cookies = new Map<string, string>()

  constructor(session: AvanzaSession | null = null) {
    this.session = session
    if (session?.cookies) {
      for (const [k, v] of Object.entries(session.cookies)) this.cookies.set(k, v)
    }
  }

  setSession(s: AvanzaSession) {
    this.session = s
  }

  getSession(): AvanzaSession | null {
    return this.session
  }

  setCookie(name: string, value: string) {
    this.cookies.set(name, value)
  }

  cookieMap(): Record<string, string> {
    return Object.fromEntries(this.cookies)
  }

  // Parse all Set-Cookie headers from a response and merge them into the jar.
  // Strips the cookie attributes (Path/Domain/Expires/etc.) — we only need
  // the name=value pair for re-sending.
  ingestSetCookies(setCookieList: string[]) {
    for (const sc of setCookieList) {
      const firstPair = sc.split(';', 1)[0]
      const eq = firstPair.indexOf('=')
      if (eq <= 0) continue
      const name = firstPair.slice(0, eq).trim()
      const value = firstPair.slice(eq + 1).trim()
      if (!name) continue
      // RFC: a Set-Cookie with empty value or expired Max-Age clears it.
      if (value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async raw<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<AvanzaResponse<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Origin: 'https://www.avanza.se',
      Referer: 'https://www.avanza.se/min-ekonomi/oversikt.html',
      'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8',
      ...extraHeaders,
    }
    if (this.session?.authenticationSession) {
      headers['X-AuthenticationSession'] = this.session.authenticationSession
    }
    // Avanza's CSRF check expects X-SecurityToken to equal the AZACSRF
    // cookie value (Angular pattern: cookie value echoed as header). The
    // session.securityToken from BankID finalize is stale by the time we
    // make data calls — so prefer the live cookie value.
    const azacsrf = this.cookies.get('AZACSRF')
    if (azacsrf) {
      headers['X-SecurityToken'] = azacsrf
    } else if (this.session?.securityToken) {
      headers['X-SecurityToken'] = this.session.securityToken
    }
    if (this.cookies.size > 0) {
      headers.Cookie = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    }

    // Follow redirects manually so we can absorb Set-Cookie headers at every
    // hop. Node's `fetch` with redirect: 'follow' only exposes the final
    // response's headers; auth cookies set on intermediate 302s would be
    // lost — and that's exactly the chain Avanza's BankID login uses.
    let url = path.startsWith('http') ? path : `${BASE}${path}`
    let res: Response
    let allSetCookies: string[] = []
    let hopBody: string | undefined =
      body !== undefined ? JSON.stringify(body) : undefined
    let hopMethod = method
    let hopHeaders = { ...headers }
    if (this.cookies.size > 0) {
      hopHeaders.Cookie = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    }
    for (let hop = 0; hop < 10; hop++) {
      try {
        res = await fetch(url, {
          method: hopMethod,
          headers: hopHeaders,
          body: hopBody,
          redirect: 'manual',
        })
      } catch (e) {
        // Node's fetch throws TypeError("fetch failed") for DNS/connect/TLS
        // failures — surface those as a typed network error so the
        // orchestrator can mark the connection retryable.
        throw new NetworkError(`Avanza ${method} ${path}: ${(e as Error).message}`, { cause: e })
      }
      const setCookies =
        typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      if (setCookies.length > 0) {
        this.ingestSetCookies(setCookies)
        allSetCookies.push(...setCookies)
      }
      if (process.env.AVANZA_DEBUG === '1') {
        const names = setCookies.map((c) => c.split(';', 1)[0].split('=', 1)[0]).join(',')
        console.log(`[avanza] ${hopMethod} ${url.replace(BASE, '')} → ${res.status} cookies+[${names}]`)
        // Full Set-Cookie strings (truncated per-cookie) for diagnosing
        // missing cookies / odd attributes / second values.
        for (const sc of setCookies) {
          console.log(`[avanza]   set-cookie: ${sc.slice(0, 200)}`)
        }
      }
      // Manual redirect handling: 301/302/303/307/308.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) break
        url = new URL(loc, url).toString()
        // 303 always becomes GET; 301/302 historically downgrade POST→GET in
        // browsers and most fetch impls; 307/308 preserve method.
        if (res.status === 303 || res.status === 301 || res.status === 302) {
          hopMethod = 'GET'
          hopBody = undefined
          delete hopHeaders['Content-Type']
        }
        // Re-attach any newly accumulated cookies for the next hop.
        if (this.cookies.size > 0) {
          hopHeaders.Cookie = Array.from(this.cookies.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')
        }
        continue
      }
      break
    } // end hop loop
    res = res!
    const setCookies = allSetCookies

    let data: T
    if (res.status === 204) {
      data = {} as T
    } else {
      const text = await res.text()
      if (!text) {
        data = {} as T
      } else {
        try {
          data = JSON.parse(text) as T
        } catch {
          throw new ProviderRegressionError(
            `Avanza ${method} ${path} ${res.status}: non-JSON response: ${text.slice(0, 200)}`,
          )
        }
      }
    }

    if (!res.ok) {
      const detail =
        typeof data === 'object' && data !== null
          ? JSON.stringify(data).slice(0, 300)
          : String(data).slice(0, 300)
      const summary = `Avanza ${method} ${path} ${res.status}: ${detail}`
      if (res.status === 401 || res.status === 403) {
        throw new AuthExpiredError(summary)
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'))
        throw new RateLimitedError(summary, {
          retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
        })
      }
      if (res.status >= 500) throw new ProviderRegressionError(summary)
      throw new Error(summary)
    }

    return { status: res.status, body: data, headers: res.headers, setCookies }
  }

  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.raw<T>('GET', path, undefined, headers).then((r) => r.body)
  }

  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.raw<T>('POST', path, body, headers).then((r) => r.body)
  }
}

export function templatePath(template: string, params: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, encodeURIComponent(v))
  }
  return out
}
