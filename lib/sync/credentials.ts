// Read/write encrypted credentials for a connection. Persistence lives
// in the repo; this module is the encrypt/decrypt boundary.

import * as credentialsRepo from '@/lib/repositories/connection-credentials'
import { decryptJSON, encryptJSON } from '@/lib/crypto/secrets'

export function saveCredentials(
  connectionId: string,
  credentials: Record<string, unknown>,
): void {
  credentialsRepo.upsert(connectionId, encryptJSON(credentials))
}

export function loadCredentials(connectionId: string): Record<string, unknown> | null {
  const row = credentialsRepo.getByConnectionId(connectionId)
  if (!row) return null
  try {
    return decryptJSON({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    })
  } catch {
    // Corrupted, tampered, or BANKING_SECRET changed — caller should
    // treat as "no credentials" and prompt re-auth.
    return null
  }
}

export function deleteCredentials(connectionId: string): void {
  credentialsRepo.deleteByConnectionId(connectionId)
}
