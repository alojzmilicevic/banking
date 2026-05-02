// Structured error categories so the orchestrator + UI can decide how to
// react (retry, prompt re-link, surface as transient, …) instead of
// guessing from a freeform message.

export type SyncErrorCategory =
  | 'auth_expired'
  | 'rate_limited'
  | 'network'
  | 'provider_regression'
  | 'unknown'

export class SyncError extends Error {
  readonly category: SyncErrorCategory
  readonly retryAfterSec?: number

  constructor(
    category: SyncErrorCategory,
    message: string,
    opts: { retryAfterSec?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause })
    this.name = 'SyncError'
    this.category = category
    this.retryAfterSec = opts.retryAfterSec
  }
}

export class AuthExpiredError extends SyncError {
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super('auth_expired', message, opts)
    this.name = 'AuthExpiredError'
  }
}

export class RateLimitedError extends SyncError {
  constructor(message: string, opts: { retryAfterSec?: number; cause?: unknown } = {}) {
    super('rate_limited', message, opts)
    this.name = 'RateLimitedError'
  }
}

export class NetworkError extends SyncError {
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super('network', message, opts)
    this.name = 'NetworkError'
  }
}

export class ProviderRegressionError extends SyncError {
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super('provider_regression', message, opts)
    this.name = 'ProviderRegressionError'
  }
}

export function classifyError(e: unknown): SyncError {
  if (e instanceof SyncError) return e

  // fetch network failures land here as TypeError with a 'fetch failed' cause.
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return new NetworkError(e.message, { cause: e })
  }

  // Map HTTP-status-shaped errors thrown by the providers' raw fetchers.
  // Both Avanza and EB throw `Error("PROVIDER METHOD path STATUS: …")`.
  const message = e instanceof Error ? e.message : String(e)
  const statusMatch = message.match(/\b(\d{3})\b/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    if (status === 401 || status === 403) {
      return new AuthExpiredError(message, { cause: e })
    }
    if (status === 429) {
      return new RateLimitedError(message, { cause: e })
    }
    if (status >= 500) {
      return new ProviderRegressionError(message, { cause: e })
    }
  }

  return new SyncError('unknown', message, { cause: e })
}
