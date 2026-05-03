// Read Avanza session cookies directly from the user's local Chrome profile.
//
// Why: Avanza's BankID server-side flow doesn't yield cookies that can
// authenticate /_api/* endpoints from Node — they appear to fingerprint
// the TLS/HTTP layer. The user already has a fully-authenticated session
// in their Chrome browser after they log in normally; we just borrow
// those cookies into our local DB.
//
// How: chrome-cookies-secure reads
// ~/Library/Application Support/Google/Chrome/<Profile>/Cookies (SQLite)
// and uses Keychain Access on macOS to decrypt the values. First call may
// prompt for Keychain access. The Profile name defaults to "Default" but
// must be selectable for households where each person uses their own
// profile (otherwise we'd grab whoever's logged in on Default).

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type CookieMap = Record<string, string>

interface ChromeCookiesModule {
  getCookies: (
    url: string,
    format: 'object' | 'header' | 'jar' | 'curl' | 'set-cookie' | 'puppeteer',
    callback: (err: Error | null, cookies: CookieMap | string) => void,
    profile?: string,
  ) => void
}

export interface ExtractedCookies {
  cookieHeader: string // ready to paste into the Avanza paste-cookies form
  names: string[]
  count: number
  profile: string
}

const CHROME_DIR = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')

export async function readAvanzaCookiesFromChrome(
  profile: string = 'Default',
): Promise<ExtractedCookies> {
  // Dynamic import: native bindings + macOS Keychain only resolve on this
  // platform, and we don't want to break the build on others.
  const mod = (await import('chrome-cookies-secure')) as unknown as ChromeCookiesModule

  const cookies = await new Promise<CookieMap>((resolve, reject) => {
    mod.getCookies(
      'https://www.avanza.se/',
      'object',
      (err, parsed) => {
        if (err) reject(err)
        else resolve((parsed ?? {}) as CookieMap)
      },
      profile,
    )
  })

  const names = Object.keys(cookies)
  const cookieHeader = names.map((k) => `${k}=${cookies[k]}`).join('; ')
  return { cookieHeader, names, count: names.length, profile }
}

export interface ChromeProfile {
  // Folder name used by chrome-cookies-secure (e.g. "Default", "Profile 1").
  id: string
  // Best display name we can find — prefers the Google account's full
  // name (gaia_name), falls back to the user-set profile label, then the
  // folder name. Two profiles often share a gaia_name across personal/
  // work accounts of the same person, so we also surface the email.
  name: string
  // Google account email tied to the profile, when signed in.
  email: string | null
}

interface ChromeProfileCacheEntry {
  name?: string
  gaia_name?: string
  gaia_given_name?: string
  user_name?: string
}

interface ChromeLocalState {
  profile?: {
    info_cache?: Record<string, ChromeProfileCacheEntry>
  }
}

// Scan Chrome's `Local State` (one JSON file at the root of the Chrome
// dir) for the cached per-profile metadata. That's where Chrome stores
// the full GAIA name, the user-set label, and the signed-in email — all
// the bits a user can actually recognize. Falls back to a folder scan if
// Local State is missing or malformed.
export async function listChromeProfiles(): Promise<ChromeProfile[]> {
  // Try the rich source first.
  try {
    const raw = await fs.readFile(join(CHROME_DIR, 'Local State'), 'utf8')
    const parsed = JSON.parse(raw) as ChromeLocalState
    const cache = parsed.profile?.info_cache
    if (cache && Object.keys(cache).length > 0) {
      const profiles: ChromeProfile[] = Object.entries(cache).map(([id, info]) => ({
        id,
        name: info.gaia_name || info.name || id,
        email: info.user_name || null,
      }))
      // Default first, then numeric profiles in order.
      return profiles.sort((a, b) =>
        a.id === 'Default' ? -1 : b.id === 'Default' ? 1 : a.id.localeCompare(b.id),
      )
    }
  } catch {
    // Fall through to directory scan.
  }

  // Fallback: list profile dirs and read each one's Preferences for a
  // friendly name. Used when Local State isn't readable for some reason.
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(CHROME_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => n === 'Default' || /^Profile \d+$/.test(n))
    .sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b)))

  const profiles: ChromeProfile[] = []
  for (const id of candidates) {
    let displayName = id
    try {
      const prefsRaw = await fs.readFile(join(CHROME_DIR, id, 'Preferences'), 'utf8')
      const prefs = JSON.parse(prefsRaw) as { profile?: { name?: string } }
      if (prefs.profile?.name) displayName = prefs.profile.name
    } catch {
      // Preferences missing or unreadable — fall back to folder id.
    }
    profiles.push({ id, name: displayName, email: null })
  }
  return profiles
}
