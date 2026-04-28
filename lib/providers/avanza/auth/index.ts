// Avanza auth — currently a single flow: paste a Cookie header from your
// already-logged-in browser. Avanza's BankID server-side flow doesn't
// produce a session cookie that authenticates the /_api/* endpoints
// (their TLS/HTTP fingerprint check or similar rejects the auth jar
// after BankID handshake). Until that's solved, paste-from-browser is
// the sustainable path. The Chrome scraper at /api/avanza/extract-cookies
// automates the paste step on macOS.

import { db, connections } from '@/lib/db/client'
import { randomUUID } from 'node:crypto'
import type {
  AuthChallenge,
  CompleteAuthInput,
  ConnectionMaterial,
  PollAuthInput,
  StartAuthInput,
} from '../../types'
import type { AvanzaSession } from '../api'

export async function avanzaStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  if (input.flow !== 'cookies') {
    return { kind: 'error', message: `Avanza only supports the 'cookies' flow` }
  }

  const raw = String(input.input.cookies ?? '').trim()
  if (!raw) return { kind: 'error', message: 'Cookie string is empty' }

  const cookies: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name) cookies[name] = value
  }
  if (Object.keys(cookies).length === 0) {
    return { kind: 'error', message: 'No cookies parsed from input' }
  }

  // Sanity check the bare-minimum auth cookies are present.
  const required = ['csid', 'cstoken', 'AZACSRF']
  const missing = required.filter((k) => !cookies[k])
  if (missing.length > 0) {
    return {
      kind: 'error',
      message: `Cookie string is missing required keys: ${missing.join(', ')}`,
    }
  }

  const session: AvanzaSession = {
    cookies,
    expiresAt: Date.now() + 60 * 60 * 1000, // ~60min until Avanza idles us out
  }

  const connectionId = randomUUID()
  db.insert(connections)
    .values({
      id: connectionId,
      userId: input.userId,
      providerId: 'avanza',
      externalId: `cookies-${Date.now()}`,
      label: 'Avanza',
      status: 'active',
      validUntil: session.expiresAt,
      rawJson: JSON.stringify({ session }),
    })
    .run()

  return { kind: 'complete', connectionId }
}

export async function avanzaPollAuth(_input: PollAuthInput): Promise<AuthChallenge> {
  return { kind: 'error', message: 'Avanza does not use a polling auth flow' }
}

export async function avanzaCompleteAuth(_input: CompleteAuthInput): Promise<ConnectionMaterial> {
  throw new Error('Avanza does not use the OAuth-style completeAuth flow')
}
