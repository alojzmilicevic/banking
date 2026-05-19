// Avanza credentials are persisted via the same encrypted-DB path as
// every other provider (lib/sync/credentials.ts) — AES-256-GCM under
// BANKING_SECRET, stored in connection_credentials. Earlier this lived
// in the macOS Keychain for an extra layer of separation between the
// ciphertext and the decryption key, but that only worked on Mac dev
// boxes — the app deploys to Linux (Docker on a Pi), where there's no
// headless-friendly equivalent. On a single-user self-hosted host the
// Keychain layer was marginal anyway, so we collapse onto the
// platform-independent encrypted-blob path.

import {
  deleteCredentials,
  loadCredentials,
  saveCredentials,
} from '@/lib/sync/credentials'
import type { AvanzaCredentials } from './login'

export function saveAvanzaCredentials(
  connectionId: string,
  credentials: AvanzaCredentials,
): void {
  // AvanzaCredentials is structurally a Record<string, unknown> but TS
  // doesn't widen named interfaces to index signatures without a cast.
  saveCredentials(connectionId, { ...credentials })
}

export function loadAvanzaCredentials(connectionId: string): AvanzaCredentials | null {
  // loadCredentials returns Record<string, unknown> | null; the shape is
  // whatever we wrote, so cast back to AvanzaCredentials. A null here
  // means the row is missing OR decryption failed (corrupted / tampered
  // / BANKING_SECRET changed) — callers treat both the same way: prompt
  // re-link.
  return loadCredentials(connectionId) as AvanzaCredentials | null
}

export function deleteAvanzaCredentials(connectionId: string): void {
  deleteCredentials(connectionId)
}
