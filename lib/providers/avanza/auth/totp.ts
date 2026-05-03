// RFC 6238 TOTP generator. Avanza's two-factor flow uses HMAC-SHA1 with
// a 30s period and 6-digit codes — same as Google Authenticator. The
// seed (base32) is shown once during 2FA enrollment at avanza.se under
// "Kopiera nyckeln". We store it encrypted and use it to mint codes
// on demand for headless re-auth.

import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase()
  if (cleaned.length === 0) throw new Error('Empty base32 input')

  const bytes: number[] = []
  let bits = 0
  let bitCount = 0
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error(`Invalid base32 character: ${ch}`)
    bits = (bits << 5) | idx
    bitCount += 5
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bits >> bitCount) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

export interface TotpOptions {
  now?: number
  period?: number
  digits?: number
}

export function generateTotp(secretBase32: string, options: TotpOptions = {}): string {
  const { now = Date.now(), period = 30, digits = 6 } = options

  const counter = Math.floor(now / 1000 / period)
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))

  const key = decodeBase32(secretBase32)
  const hmac = createHmac('sha1', key).update(counterBuf).digest()

  // RFC 4226 dynamic truncation: low nibble of last byte picks the offset.
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return String(code % 10 ** digits).padStart(digits, '0')
}
