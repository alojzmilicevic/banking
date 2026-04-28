// Read/write encrypted credentials for a connection. The DB row holds
// only ciphertext + iv + auth_tag — plaintext lives in memory at most.

import { eq } from 'drizzle-orm'
import { connectionCredentials, db } from '@/lib/db/client'
import { decryptJSON, encryptJSON } from '@/lib/crypto/secrets'

export function saveCredentials(
  connectionId: string,
  credentials: Record<string, unknown>,
): void {
  const blob = encryptJSON(credentials)
  db.insert(connectionCredentials)
    .values({
      connectionId,
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      authTag: blob.authTag,
    })
    .onConflictDoUpdate({
      target: connectionCredentials.connectionId,
      set: {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
      },
    })
    .run()
}

export function loadCredentials(connectionId: string): Record<string, unknown> | null {
  const row = db
    .select()
    .from(connectionCredentials)
    .where(eq(connectionCredentials.connectionId, connectionId))
    .get()
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
  db.delete(connectionCredentials)
    .where(eq(connectionCredentials.connectionId, connectionId))
    .run()
}
