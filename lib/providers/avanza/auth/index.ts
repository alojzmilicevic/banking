// Top-level auth orchestration for Avanza. Branches on flow type.

import { db, authStates, connections } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type {
  AuthChallenge,
  CompleteAuthInput,
  ConnectionMaterial,
  PollAuthInput,
  StartAuthInput,
} from '../../types'
import { bankidCollect, bankidFinalize, bankidInitiate } from './bankid'
import type { AvanzaSession } from '../api'

interface BankIdStateBlob {
  flow: 'bankid'
  transactionId: string
  expiresIso: string
  qrToken: string
  // Accumulated cookies across initiate/collect/finalize steps. Avanza
  // requires the full set on /_api/* endpoints; carrying them between
  // requests in the auth state row preserves the chain.
  cookies: Record<string, string>
  preferredUsername?: string
}

const BANKID_POLL_MS = 1500

export async function avanzaStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  if (input.flow === 'bankid') {
    let init
    try {
      init = await bankidInitiate()
    } catch (e) {
      return { kind: 'error', message: (e as Error).message }
    }
    const blob: BankIdStateBlob = {
      flow: 'bankid',
      transactionId: init.transactionId,
      expiresIso: init.expires,
      qrToken: init.qrToken,
      cookies: init.cookies,
      preferredUsername: input.input.username as string | undefined,
    }
    db.insert(authStates)
      .values({
        state: input.state,
        userId: input.userId,
        providerId: 'avanza',
        flow: 'bankid',
        status: 'pending',
        payload: JSON.stringify(blob),
        expiresAt: new Date(init.expires).getTime(),
      })
      .run()
    return {
      kind: 'polling',
      state: input.state,
      pollEveryMs: BANKID_POLL_MS,
      expiresAt: new Date(init.expires).getTime(),
      instructions: 'Scan the QR code with your BankID app',
      hint: { qrToken: init.qrToken, transactionId: init.transactionId },
    }
  }

  if (input.flow === 'cookies') {
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

    const session: AvanzaSession = {
      cookies,
      // No tokens — paste flow doesn't have them. The /_api/* endpoints
      // we hit are cookie-authenticated, so this is enough.
      expiresAt: Date.now() + 60 * 60 * 1000, // assume 60min until expiry
    }

    const connectionId = randomUUID()
    db.insert(connections)
      .values({
        id: connectionId,
        userId: input.userId,
        providerId: 'avanza',
        externalId: `pasted-${Date.now()}`,
        label: 'Avanza (pasted cookies)',
        status: 'active',
        validUntil: session.expiresAt,
        rawJson: JSON.stringify({ session, login: { username: 'pasted' } }),
      })
      .run()

    return { kind: 'complete', connectionId }
  }

  if (input.flow === 'credentials') {
    return {
      kind: 'error',
      message: 'Avanza credentials flow not implemented yet (waiting for password+TOTP wiring)',
    }
  }

  return { kind: 'error', message: `Avanza does not support flow '${input.flow}'` }
}

export async function avanzaPollAuth(input: PollAuthInput): Promise<AuthChallenge> {
  const row = db.select().from(authStates).where(eq(authStates.state, input.state)).get()
  if (!row) return { kind: 'error', state: input.state, message: 'Unknown auth state' }
  if (row.providerId !== 'avanza') {
    return { kind: 'error', state: input.state, message: 'State is not for Avanza' }
  }

  if (row.status === 'complete' && row.result) {
    const r = JSON.parse(row.result) as { connectionId: string }
    return { kind: 'complete', connectionId: r.connectionId }
  }
  if (row.status === 'error' && row.result) {
    return { kind: 'error', state: input.state, message: row.result }
  }
  if (row.expiresAt < Date.now()) {
    db.update(authStates)
      .set({ status: 'error', result: 'BankID transaction expired' })
      .where(eq(authStates.state, input.state))
      .run()
    return { kind: 'error', state: input.state, message: 'BankID transaction expired' }
  }

  const blob = JSON.parse(row.payload) as BankIdStateBlob

  let collect
  try {
    collect = await bankidCollect(blob.transactionId, blob.cookies)
  } catch (e) {
    return { kind: 'error', state: input.state, message: (e as Error).message }
  }

  // Merge new cookies + refreshed qrToken into the persisted blob so the
  // next poll continues with the full session state.
  const merged = { ...blob, cookies: { ...blob.cookies, ...collect.cookies } }
  if (collect.qrToken && collect.qrToken !== blob.qrToken) {
    merged.qrToken = collect.qrToken
  }
  if (
    merged.qrToken !== blob.qrToken ||
    Object.keys(collect.cookies).length !== Object.keys(blob.cookies).length
  ) {
    db.update(authStates)
      .set({ payload: JSON.stringify(merged) })
      .where(eq(authStates.state, input.state))
      .run()
  }

  if (collect.state !== 'COMPLETE') {
    return {
      kind: 'polling',
      state: input.state,
      pollEveryMs: BANKID_POLL_MS,
      expiresAt: row.expiresAt,
      instructions: humanizeBankIdHint(collect.hint, collect.state),
      hint: {
        state: collect.state,
        hintCode: collect.hint,
        rfa: collect.rfa,
        qrToken: merged.qrToken,
        transactionId: blob.transactionId,
      },
    }
  }

  if (!collect.logins || collect.logins.length === 0) {
    const msg = 'BankID complete but no Avanza logins returned'
    db.update(authStates)
      .set({ status: 'error', result: msg })
      .where(eq(authStates.state, input.state))
      .run()
    return { kind: 'error', state: input.state, message: msg }
  }

  const login =
    (blob.preferredUsername &&
      collect.logins.find((l) => l.username === blob.preferredUsername)) ||
    collect.logins[0]

  let session: AvanzaSession
  try {
    session = await bankidFinalize(login, merged.cookies)
  } catch (e) {
    const msg = (e as Error).message
    db.update(authStates)
      .set({ status: 'error', result: msg })
      .where(eq(authStates.state, input.state))
      .run()
    return { kind: 'error', state: input.state, message: msg }
  }

  // The finalize step's session.cookies already contains the merged jar
  // (it was seeded with `merged.cookies` then accumulated any Set-Cookie
  // from the loginPath response). Persist as-is.
  const connectionId = randomUUID()
  db.insert(connections)
    .values({
      id: connectionId,
      userId: row.userId,
      providerId: 'avanza',
      externalId: session.customerId ?? login.customerId,
      label: `Avanza (${login.username})`,
      status: 'active',
      validUntil: session.expiresAt,
      rawJson: JSON.stringify({ session, login: { username: login.username } }),
    })
    .run()

  db.update(authStates)
    .set({ status: 'complete', result: JSON.stringify({ connectionId }) })
    .where(eq(authStates.state, input.state))
    .run()

  return { kind: 'complete', connectionId }
}

function humanizeBankIdHint(hint: string | undefined, state: string | undefined): string {
  const key = (hint || state || '').toUpperCase().replace(/_/g, '')
  switch (key) {
    case 'OUTSTANDINGTRANSACTION':
      return 'Open the BankID app and scan the QR code'
    case 'USERSIGN':
      return 'Confirm in your BankID app'
    case 'STARTED':
      return 'BankID started — keep going'
    case 'NOCLIENT':
      return 'Open BankID on your phone'
    case 'CANCELLED':
    case 'USERCANCEL':
      return 'Cancelled'
    case 'EXPIREDTRANSACTION':
      return 'BankID transaction expired'
    default:
      return hint || state || 'Awaiting BankID'
  }
}

export async function avanzaCompleteAuth(_input: CompleteAuthInput): Promise<ConnectionMaterial> {
  throw new Error('Avanza uses pollAuth, not completeAuth')
}
