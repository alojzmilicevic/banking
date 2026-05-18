import { describe, expect, it } from 'vitest'
import {
  AuthExpiredError,
  NetworkError,
  ProviderRegressionError,
  RateLimitedError,
  SyncError,
  classifyError,
} from './errors'

describe('classifyError', () => {
  it('passes through existing SyncError instances unchanged', () => {
    const original = new AuthExpiredError('token expired')
    const out = classifyError(original)
    expect(out).toBe(original)
  })

  it('classifies fetch TypeError as network', () => {
    const err = new TypeError('fetch failed')
    const out = classifyError(err)
    expect(out).toBeInstanceOf(NetworkError)
    expect(out.category).toBe('network')
  })

  it('classifies 401 as auth_expired', () => {
    const err = new Error('AVANZA GET /api/foo 401: unauthorized')
    const out = classifyError(err)
    expect(out).toBeInstanceOf(AuthExpiredError)
    expect(out.category).toBe('auth_expired')
  })

  it('classifies 403 as auth_expired', () => {
    const err = new Error('EB GET /accounts 403: forbidden')
    expect(classifyError(err).category).toBe('auth_expired')
  })

  it('classifies 429 as rate_limited', () => {
    const err = new Error('AVANZA GET /api/foo 429: too many requests')
    const out = classifyError(err)
    expect(out).toBeInstanceOf(RateLimitedError)
    expect(out.category).toBe('rate_limited')
  })

  it('classifies 5xx as provider_regression', () => {
    const err = new Error('AVANZA GET /api/foo 502: bad gateway')
    expect(classifyError(err)).toBeInstanceOf(ProviderRegressionError)
    expect(classifyError(new Error('500 Internal')).category).toBe('provider_regression')
  })

  it('classifies arbitrary errors as unknown', () => {
    const out = classifyError(new Error('something blew up'))
    expect(out).toBeInstanceOf(SyncError)
    expect(out.category).toBe('unknown')
  })

  it('handles non-Error throws (strings, plain objects)', () => {
    expect(classifyError('boom').category).toBe('unknown')
    expect(classifyError({ weird: true }).category).toBe('unknown')
  })

  it('preserves original error as cause', () => {
    const original = new Error('401: bad token')
    const out = classifyError(original)
    expect(out.cause).toBe(original)
  })
})
