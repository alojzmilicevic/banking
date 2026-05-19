import { describe, expect, it } from 'vitest'
// @ts-expect-error - .mjs script has no .d.ts; we're testing the pure
// helpers, types don't carry meaning here.
import { codenameFor, fnv1a } from '../scripts/build-info.mjs'

describe('build-info codename', () => {
  it('is stable for a given seed', () => {
    // Locking these values in is the whole point of the test: the
    // "same commit → same codename on every host" property breaks
    // silently if the hash function or the word lists drift.
    expect(codenameFor('0032bdf')).toBe('tidy-chinchilla')
    expect(codenameFor('dev')).toBe(codenameFor('dev'))
  })

  it('produces different names for different seeds', () => {
    expect(codenameFor('aaaaaaa')).not.toBe(codenameFor('bbbbbbb'))
  })

  it('always returns adjective-animal shape', () => {
    for (const seed of ['0032bdf', 'dev', 'abc1234', 'ffffff0']) {
      expect(codenameFor(seed)).toMatch(/^[a-z]+-[a-z]+$/)
    }
  })

  it('fnv1a is deterministic', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'))
    expect(fnv1a('hello')).not.toBe(fnv1a('hello!'))
  })
})
