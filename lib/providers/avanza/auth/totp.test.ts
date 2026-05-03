import { describe, expect, it } from 'vitest'
import { decodeBase32, generateTotp } from './totp'

// RFC 6238 Appendix B test vector: ASCII "12345678901234567890" base32-encoded.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('decodeBase32', () => {
  it('decodes a known seed to its 20-byte ASCII secret', () => {
    expect(decodeBase32(RFC_SECRET).toString('utf-8')).toBe('12345678901234567890')
  })

  it('tolerates lowercase, whitespace, and trailing padding', () => {
    expect(decodeBase32(' gezd gnbv gy3t qojq ==').toString('utf-8')).toBe('1234567890')
  })

  it('rejects invalid characters', () => {
    expect(() => decodeBase32('ABCD1!')).toThrow()
  })

  it('rejects empty input', () => {
    expect(() => decodeBase32('   ')).toThrow()
  })
})

describe('generateTotp (RFC 6238 SHA-1 test vectors, truncated to 6 digits)', () => {
  // RFC vectors are 8 digits; Google Authenticator / Avanza use 6, so we
  // expect the last 6 digits of each canonical vector.
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('T=%i seconds → %s', (timeSec, expected) => {
    expect(generateTotp(RFC_SECRET, { now: timeSec * 1000 })).toBe(expected)
  })

  it('zero-pads codes shorter than 6 digits', () => {
    const code = generateTotp(RFC_SECRET, { now: 1111111109 * 1000 })
    expect(code).toBe('081804')
    expect(code).toHaveLength(6)
  })

  it('returns the same code within a 30s window', () => {
    // 1_700_000_010 is exactly divisible by 30, i.e. the start of a window.
    const a = generateTotp(RFC_SECRET, { now: 1_700_000_010_000 })
    const b = generateTotp(RFC_SECRET, { now: 1_700_000_039_000 })
    expect(a).toBe(b)
  })

  it('returns a different code after the window rolls', () => {
    const a = generateTotp(RFC_SECRET, { now: 1_700_000_010_000 })
    const b = generateTotp(RFC_SECRET, { now: 1_700_000_040_000 })
    expect(a).not.toBe(b)
  })
})
