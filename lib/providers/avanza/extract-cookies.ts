// Read Avanza session cookies directly from the user's local Chrome profile.
//
// Why: Avanza's BankID server-side flow doesn't yield cookies that can
// authenticate /_api/* endpoints from Node — they appear to fingerprint
// the TLS/HTTP layer. The user already has a fully-authenticated session
// in their Chrome browser after they log in normally; we just borrow
// those cookies into our local DB.
//
// How: chrome-cookies-secure reads ~/Library/Application Support/Google/
// Chrome/Default/Cookies (SQLite) and uses Keychain Access on macOS to
// decrypt the values. First call may prompt for Keychain access.

type CookieMap = Record<string, string>

interface ChromeCookiesModule {
  getCookies: (
    url: string,
    format: 'object' | 'header' | 'jar' | 'curl' | 'set-cookie' | 'puppeteer',
    callback: (err: Error | null, cookies: CookieMap | string) => void,
  ) => void
}

export interface ExtractedCookies {
  cookieHeader: string // ready to paste into the Avanza paste-cookies form
  names: string[]
  count: number
}

export async function readAvanzaCookiesFromChrome(): Promise<ExtractedCookies> {
  // Dynamic import: native bindings + macOS Keychain only resolve on this
  // platform, and we don't want to break the build on others.
  const mod = (await import('chrome-cookies-secure')) as unknown as ChromeCookiesModule

  const cookies = await new Promise<CookieMap>((resolve, reject) => {
    mod.getCookies('https://www.avanza.se/', 'object', (err, parsed) => {
      if (err) reject(err)
      else resolve((parsed ?? {}) as CookieMap)
    })
  })

  const names = Object.keys(cookies)
  const cookieHeader = names.map((k) => `${k}=${cookies[k]}`).join('; ')
  return { cookieHeader, names, count: names.length }
}
