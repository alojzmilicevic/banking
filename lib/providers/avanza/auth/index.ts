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
  personnummer: string
  transactionId: string
  expiresIso: string
  autostartToken: string
  preferredUsername?: string
}

const BANKID_POLL_MS = 2000

export async function avanzaStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  if (input.flow === 'bankid') {
    const personnummer = String(input.input.personnummer ?? '').replace(/\s|-/g, '')
    if (!personnummer) {
      return { kind: 'error', message: 'personnummer required (YYYYMMDDXXXX)' }
    }
    const init = await bankidInitiate(personnummer)
    const blob: BankIdStateBlob = {
      flow: 'bankid',
      personnummer,
      transactionId: init.transactionId,
      expiresIso: init.expires,
      autostartToken: init.autostartToken,
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
      instructions: 'Open BankID on your phone and approve the login',
      hint: { autostartToken: init.autostartToken },
    }
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

  // If already completed in a prior poll, fast-path the result.
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
  if (blob.flow !== 'bankid') {
    return { kind: 'error', state: input.state, message: 'State is not a BankID flow' }
  }

  let collect
  try {
    collect = await bankidCollect(blob.transactionId)
  } catch (e) {
    return { kind: 'error', state: input.state, message: (e as Error).message }
  }

  if (collect.state !== 'COMPLETE') {
    // Still pending. Surface Avanza's hint code as a hint.
    return {
      kind: 'polling',
      state: input.state,
      pollEveryMs: BANKID_POLL_MS,
      expiresAt: row.expiresAt,
      instructions: collect.hintCode ?? collect.state ?? 'Awaiting BankID',
      hint: { state: collect.state, hintCode: collect.hintCode },
    }
  }

  // COMPLETE — pick a login and finalize.
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
    session = await bankidFinalize(login)
  } catch (e) {
    const msg = (e as Error).message
    db.update(authStates)
      .set({ status: 'error', result: msg })
      .where(eq(authStates.state, input.state))
      .run()
    return { kind: 'error', state: input.state, message: msg }
  }

  // Persist the connection.
  const connectionId = randomUUID()
  db.insert(connections)
    .values({
      id: connectionId,
      userId: row.userId,
      providerId: 'avanza',
      externalId: session.customerId,
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

// Avanza doesn't use the OAuth-style completeAuth path. Defined for symmetry
// only — startAuth/pollAuth handle everything.
export async function avanzaCompleteAuth(_input: CompleteAuthInput): Promise<ConnectionMaterial> {
  throw new Error('Avanza uses pollAuth, not completeAuth')
}
