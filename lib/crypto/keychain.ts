// macOS Keychain wrapper. Used by the Avanza provider to keep the
// password + TOTP seed off disk entirely — the encrypted-blob path
// (lib/sync/credentials.ts) protects against DB-file leaks but only
// while BANKING_SECRET is also kept private. Keychain decouples the
// two: the secret value lives in the OS keystore, gated by per-user
// ACLs.
//
// Implementation: shells out to /usr/bin/security. Generic items are
// keyed by (service, account); the value goes into the password
// field. We pass the value via argv, which is briefly visible in
// `ps` for the lifetime of the security subprocess. On a single-user
// macOS laptop that exposure is below the bar — `ps` only shows
// argv to the same uid, which already has Keychain read access.
//
// macOS only. Other platforms throw — no transparent fallback,
// because silently dropping back to env-encrypted SQLite would
// defeat the security boundary the caller asked for.

import { spawnSync } from 'node:child_process'

const SECURITY_BIN = '/usr/bin/security'

function ensureMac(): void {
  if (process.platform !== 'darwin') {
    throw new Error('Keychain helper requires macOS (process.platform = darwin)')
  }
}

export function setKeychainItem(service: string, account: string, value: string): void {
  ensureMac()
  const r = spawnSync(SECURITY_BIN, [
    'add-generic-password',
    '-s', service,
    '-a', account,
    '-w', value,
    '-U', // update if it already exists
    // Restrict ACL to the security CLI itself — any other process
    // that wants to read this item triggers a Keychain prompt, which
    // is the audit trail we want.
    '-T', SECURITY_BIN,
  ])
  if (r.status !== 0) {
    throw new Error(
      `security add-generic-password failed (${r.status}): ${r.stderr.toString().trim()}`,
    )
  }
}

export function getKeychainItem(service: string, account: string): string | null {
  ensureMac()
  const r = spawnSync(SECURITY_BIN, [
    'find-generic-password',
    '-s', service,
    '-a', account,
    '-w', // password-only output
  ])
  if (r.status !== 0) {
    // 44 = "the specified item could not be found in the keychain".
    // Anything else is a real error worth surfacing.
    if (r.status === 44) return null
    throw new Error(
      `security find-generic-password failed (${r.status}): ${r.stderr.toString().trim()}`,
    )
  }
  // -w outputs the password followed by a single newline.
  return r.stdout.toString().replace(/\n$/, '')
}

export function deleteKeychainItem(service: string, account: string): void {
  ensureMac()
  const r = spawnSync(SECURITY_BIN, [
    'delete-generic-password',
    '-s', service,
    '-a', account,
  ])
  // Best-effort: status 44 (not found) is fine — disconnect should be
  // idempotent. Any other non-zero is an actual problem.
  if (r.status !== 0 && r.status !== 44) {
    throw new Error(
      `security delete-generic-password failed (${r.status}): ${r.stderr.toString().trim()}`,
    )
  }
}
