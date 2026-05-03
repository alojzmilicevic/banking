// Avanza auth — currently a single flow: paste a Cookie header from your
// already-logged-in browser. Avanza's BankID server-side flow doesn't
// produce a session cookie that authenticates the /_api/* endpoints
// (their TLS/HTTP fingerprint check or similar rejects the auth jar
// after BankID handshake). Until that's solved, paste-from-browser is
// the sustainable path. The Chrome scraper at /api/avanza/extract-cookies
// automates the paste step on macOS.

import { and, eq, isNull } from 'drizzle-orm'
import { db, connections } from '@/lib/db/client'
import { saveCredentials } from '@/lib/sync/credentials'
import { syncConnection } from '@/lib/sync/orchestrator'
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

  const holderRaw = input.input.holder
  const holder =
    holderRaw === 'alma' || holderRaw === 'alojz' || holderRaw === 'joint' ? holderRaw : null

  // Re-link should reuse the existing (user, avanza, holder) connection so
  // refreshing credentials doesn't create a duplicate row. The upsert key
  // MUST include holder — the household shares one user but has multiple
  // holders, so matching on (user, provider) alone would have a re-link
  // under Alojz overwrite Alma's connection (and vice-versa).
  const existing = db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.userId, input.userId),
        eq(connections.providerId, 'avanza'),
        holder ? eq(connections.holder, holder) : isNull(connections.holder),
      ),
    )
    .get()

  const connectionId = existing?.id ?? randomUUID()
  if (existing) {
    db.update(connections)
      .set({
        status: 'active',
        validUntil: session.expiresAt,
        lastSyncError: null,
        rawJson: JSON.stringify({ expiresAt: session.expiresAt }),
      })
      .where(eq(connections.id, existing.id))
      .run()
  } else {
    db.insert(connections)
      .values({
        id: connectionId,
        userId: input.userId,
        providerId: 'avanza',
        externalId: `cookies-${Date.now()}`,
        label: 'Avanza',
        holder,
        status: 'active',
        validUntil: session.expiresAt,
        // Only non-secret metadata in rawJson. Cookies live encrypted in
        // connection_credentials.
        rawJson: JSON.stringify({ expiresAt: session.expiresAt }),
      })
      .run()
  }

  // Encrypt + persist the cookie jar separately so the plaintext never
  // touches connections.raw_json. saveCredentials upserts by connectionId.
  saveCredentials(connectionId, { cookies })

  // Trigger initial sync inline so the user sees accounts/balances right
  // after the success splash. EB does this from its OAuth callback;
  // cookie-flow providers have no callback so it lands here. Failures
  // are logged but don't abort link — the connection still exists; the
  // user can retry sync from the UI.
  try {
    await syncConnection(connectionId)
  } catch (e) {
    console.error('[avanza] initial sync failed:', e)
  }

  return { kind: 'complete', connectionId }
}

export async function avanzaPollAuth(_input: PollAuthInput): Promise<AuthChallenge> {
  return { kind: 'error', message: 'Avanza does not use a polling auth flow' }
}

export async function avanzaCompleteAuth(_input: CompleteAuthInput): Promise<ConnectionMaterial> {
  throw new Error('Avanza does not use the OAuth-style completeAuth flow')
}
