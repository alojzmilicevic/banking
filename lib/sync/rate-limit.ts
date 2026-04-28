// Tiny in-process token-bucket rate limiter. Lives in module scope so it
// resets on dev server reload — fine for a single-instance home app.

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec?: number
}

/**
 * Token-bucket: `capacity` tokens max, refills 1 token every
 * `refillIntervalMs`. Each call consumes 1 token.
 */
export function rateLimit(
  key: string,
  capacity: number,
  refillIntervalMs: number,
): RateLimitResult {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    b = { tokens: capacity, lastRefill: now }
    buckets.set(key, b)
  } else {
    const elapsed = now - b.lastRefill
    const refill = Math.floor(elapsed / refillIntervalMs)
    if (refill > 0) {
      b.tokens = Math.min(capacity, b.tokens + refill)
      b.lastRefill += refill * refillIntervalMs
    }
  }

  if (b.tokens > 0) {
    b.tokens -= 1
    return { allowed: true }
  }

  const waitMs = b.lastRefill + refillIntervalMs - now
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) }
}
