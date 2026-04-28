// Thin HTTP client for Avanza's unofficial mobile API. Manages the two
// session headers (X-AuthenticationSession, X-SecurityToken) and a small
// cookie jar (we only ever set AZAMFATRANSACTION manually during BankID
// auth — so a Map is enough, no parser needed).

import { BASE } from './constants'

export interface AvanzaSession {
  securityToken: string
  authenticationSession: string
  customerId: string
  pushSubscriptionId?: string
  // Unix ms. Avanza sessions expire after ~60 min of idle.
  expiresAt: number
}

export interface AvanzaResponse<T> {
  status: number
  body: T
  headers: Headers
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export class AvanzaApi {
  private session: AvanzaSession | null
  private cookies = new Map<string, string>()

  constructor(session: AvanzaSession | null = null) {
    this.session = session
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

  async raw<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<AvanzaResponse<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
      ...extraHeaders,
    }
    if (this.session) {
      headers['X-AuthenticationSession'] = this.session.authenticationSession
      headers['X-SecurityToken'] = this.session.securityToken
    }
    if (this.cookies.size > 0) {
      headers.Cookie = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    }

    const url = path.startsWith('http') ? path : `${BASE}${path}`
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

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
          throw new Error(
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
      throw new Error(`Avanza ${method} ${path} ${res.status}: ${detail}`)
    }

    return { status: res.status, body: data, headers: res.headers }
  }

  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.raw<T>('GET', path, undefined, headers).then((r) => r.body)
  }

  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.raw<T>('POST', path, body, headers).then((r) => r.body)
  }
}

// Convenience: build a path with template params.
export function templatePath(template: string, params: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{${k}}`, encodeURIComponent(v))
  }
  return out
}
