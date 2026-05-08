// connection_credentials repository — drizzle queries only.
// Stores ciphertext only; encryption/decryption belongs in the caller.

import { eq } from 'drizzle-orm'
import { connectionCredentials, db } from '@/lib/db/client'
import type { ConnectionCredential } from '@/lib/db/schema'

export interface CredentialBlob {
  ciphertext: string
  iv: string
  authTag: string
}

export function getByConnectionId(connectionId: string): ConnectionCredential | null {
  return (
    db
      .select()
      .from(connectionCredentials)
      .where(eq(connectionCredentials.connectionId, connectionId))
      .get() ?? null
  )
}

export function upsert(connectionId: string, blob: CredentialBlob): void {
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

export function deleteByConnectionId(connectionId: string): void {
  db.delete(connectionCredentials)
    .where(eq(connectionCredentials.connectionId, connectionId))
    .run()
}
