// AES-256-GCM encryption for sensitive at-rest data (provider cookies,
// passwords, TOTP secrets). Used for `connection_credentials` rows.
//
// Key derivation: scrypt over BANKING_SECRET env var (a passphrase set in
// .env.local). Fixed salt is fine here — we're not storing the key, just
// re-deriving on each call. If you rotate BANKING_SECRET, all stored
// ciphertexts become unreadable; treat it like a primary database key.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALG = 'aes-256-gcm'
const KEY_LEN = 32 // 256 bits
const IV_LEN = 12 // GCM standard
const SALT = Buffer.from('banking-app-v1', 'utf8')

let cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const passphrase = process.env.BANKING_SECRET
  if (!passphrase || passphrase.length < 8) {
    throw new Error(
      'BANKING_SECRET env var is required (>= 8 chars) to encrypt/decrypt credentials',
    )
  }
  cachedKey = scryptSync(passphrase, SALT, KEY_LEN)
  return cachedKey
}

export interface EncryptedBlob {
  ciphertext: string // base64
  iv: string // base64
  authTag: string // base64
}

export function encrypt(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALG, getKey(), iv)
  const buf = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: buf.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decrypt(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(ALG, getKey(), Buffer.from(blob.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(blob.authTag, 'base64'))
  const buf = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ])
  return buf.toString('utf8')
}

// Convenience for the cookie-jar use case.
export function encryptJSON<T>(value: T): EncryptedBlob {
  return encrypt(JSON.stringify(value))
}

export function decryptJSON<T>(blob: EncryptedBlob): T {
  return JSON.parse(decrypt(blob)) as T
}
