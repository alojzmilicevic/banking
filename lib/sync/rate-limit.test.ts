import { describe, expect, it, vi } from 'vitest'
import { rateLimit } from './rate-limit'

describe('rateLimit', () => {
  it('allows up to capacity calls in a burst', () => {
    const key = `burst-${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).allowed).toBe(true)
    }
    expect(rateLimit(key, 5, 60_000).allowed).toBe(false)
  })

  it('returns retryAfterSec when blocked', () => {
    const key = `wait-${Math.random()}`
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000)
    const r = rateLimit(key, 3, 60_000)
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBeGreaterThan(0)
    expect(r.retryAfterSec).toBeLessThanOrEqual(60)
  })

  it('refills tokens over time', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const key = `refill-${Math.random()}`
      for (let i = 0; i < 2; i++) rateLimit(key, 2, 1000)
      expect(rateLimit(key, 2, 1000).allowed).toBe(false)
      vi.setSystemTime(new Date('2026-01-01T00:00:01.5Z'))
      expect(rateLimit(key, 2, 1000).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keys are independent', () => {
    rateLimit('a', 1, 60_000)
    expect(rateLimit('a', 1, 60_000).allowed).toBe(false)
    expect(rateLimit('b', 1, 60_000).allowed).toBe(true)
  })
})
