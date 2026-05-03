// Avanza credentials live in the macOS Keychain rather than the
// encrypted SQLite blob used by other providers. Rationale: the
// password + TOTP seed together fully bypass 2FA (an attacker can
// generate codes), so a single leak (DB file + .env.local) shouldn't
// be enough to compromise the account. Keychain keeps the secret
// material outside the project directory — backups, accidental
// commits, and cloud sync no longer carry it.

import {
  deleteKeychainItem,
  getKeychainItem,
  setKeychainItem,
} from '@/lib/crypto/keychain'
import type { AvanzaCredentials } from './login'

// One Keychain item per (service, account). Account = connectionId so
// the household's per-holder Avanza connections each get their own
// entry, and disconnect can target a single one cleanly.
const SERVICE = 'banking-app-avanza'

export function saveAvanzaCredentials(
  connectionId: string,
  credentials: AvanzaCredentials,
): void {
  setKeychainItem(SERVICE, connectionId, JSON.stringify(credentials))
}

export function loadAvanzaCredentials(connectionId: string): AvanzaCredentials | null {
  const raw = getKeychainItem(SERVICE, connectionId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AvanzaCredentials
  } catch {
    // Corrupted item — treat as missing so the user re-links.
    return null
  }
}

export function deleteAvanzaCredentials(connectionId: string): void {
  deleteKeychainItem(SERVICE, connectionId)
}
