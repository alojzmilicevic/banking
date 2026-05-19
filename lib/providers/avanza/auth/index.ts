// Avanza auth — username + password + TOTP. The credentials are stored
// encrypted (AES-GCM via BANKING_SECRET) so sync.ts can re-auth
// headlessly when the cookie jar expires; the user only re-links if
// they change their Avanza password or rotate the TOTP seed.
//
// BankID server-side was attempted but rejected by Avanza's TLS/HTTP
// fingerprint check; cookie-paste from a browser worked but couldn't
// refresh itself. Password+TOTP is the path that survives.

import { randomUUID } from 'node:crypto'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as holdersRepo from '@/lib/repositories/holders'
import type {
  AuthChallenge,
  CompleteAuthInput,
  ConnectionMaterial,
  PollAuthInput,
  StartAuthInput,
} from '../../types'
import { saveAvanzaCredentials } from './credentials-store'
import { AvanzaLoginError, loginWithPassword, type AvanzaCredentials } from './login'

// 60 min lines up with Avanza's typical idle timeout. There's no
// client-readable session lifetime — we just optimistically assume an
// hour and let sync.ts re-auth on demand if the jar dies sooner.
const SESSION_TTL_MS = 60 * 60 * 1000

export async function avanzaStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  if (input.flow !== 'credentials') {
    return {
      kind: 'error',
      message: `Avanza only supports the 'credentials' flow`,
    }
  }

  const username = String(input.input.username ?? '').trim()
  const password = String(input.input.password ?? '')
  const totpSeed = String(input.input.totpSeed ?? '').trim()

  if (!username || !password || !totpSeed) {
    return {
      kind: 'error',
      message: 'username, password, and totpSeed are all required',
    }
  }

  let result
  try {
    result = await loginWithPassword(username, password, totpSeed)
  } catch (e) {
    if (e instanceof AvanzaLoginError) {
      return { kind: 'error', message: `${e.stage}: ${e.message}` }
    }
    return { kind: 'error', message: (e as Error).message }
  }

  const credentials: AvanzaCredentials = {
    cookies: result.cookies,
    username,
    password,
    totpSeed,
  }
  const expiresAt = Date.now() + SESSION_TTL_MS

  const holderIdRaw = input.input.holderId
  let holderId: string | null = null
  if (typeof holderIdRaw === 'string' && holderIdRaw.length > 0) {
    const h = holdersRepo.getById(holderIdRaw)
    if (h && h.userId === input.userId) holderId = h.id
  }

  // Re-link should reuse the existing (user, avanza, holder) connection
  // so refreshing credentials doesn't create a duplicate row. The match
  // key MUST include holder — the household has one user but multiple
  // holders, so matching on (user, provider) alone would have a re-link
  // under one holder overwrite another's connection.
  const existing = connectionsRepo.findIdByUserProviderAndHolder(input.userId, 'avanza', holderId)

  const connectionId = existing ?? randomUUID()
  if (existing) {
    connectionsRepo.update(existing, {
      status: 'active',
      validUntil: expiresAt,
      lastSyncError: null,
      rawJson: JSON.stringify({ expiresAt }),
    })
  } else {
    connectionsRepo.createWithHolder(
      {
        id: connectionId,
        userId: input.userId,
        providerId: 'avanza',
        externalId: `avanza-${Date.now()}`,
        label: 'Avanza',
        validUntil: expiresAt,
        // Only non-secret metadata in rawJson. Cookies + creds live
        // encrypted in connection_credentials.
        rawJson: JSON.stringify({ expiresAt }),
      },
      holderId,
    )
  }

  saveAvanzaCredentials(connectionId, credentials)

  // No auto-sync here — the client drives the initial sync as a
  // separate phase so the modal can show "Authenticating…" → "Loading
  // accounts…" instead of a single 20-second mystery spinner. EB
  // syncs from /api/auth/callback because that flow has no client
  // mutation to chain off; Avanza has the modal, so the modal does it.
  return { kind: 'complete', connectionId }
}

export async function avanzaPollAuth(_input: PollAuthInput): Promise<AuthChallenge> {
  return { kind: 'error', message: 'Avanza does not use a polling auth flow' }
}

export async function avanzaCompleteAuth(_input: CompleteAuthInput): Promise<ConnectionMaterial> {
  throw new Error('Avanza does not use the OAuth-style completeAuth flow')
}
