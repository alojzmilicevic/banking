import { AvanzaApi, type AvanzaSession, templatePath } from './api'
import { paths } from './constants'
import {
  normalizeAccount,
  normalizeBalances,
  normalizePositionsAndInstruments,
  normalizeTransaction,
  type AvanzaOverview,
  type AvanzaPositionsResponse,
  type AvanzaTransactionsResponse,
} from './normalize'
import type {
  ConnectionContext,
  NormalizedInstrument,
  SyncOptions,
  SyncResult,
} from '../types'

interface StoredAvanzaConnection {
  session: AvanzaSession
}

export async function avanzaSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  const stored = JSON.parse(connection.rawJson || '{}') as Partial<StoredAvanzaConnection>
  if (!stored.session) {
    throw new Error('Avanza connection has no session — re-link via BankID required')
  }
  if (stored.session.expiresAt < Date.now()) {
    throw new Error('Avanza session expired — re-link via BankID required')
  }

  const api = new AvanzaApi(stored.session)

  // 1. Account list + per-account totals.
  const overview = await api.get<AvanzaOverview>(paths.OVERVIEW)
  const accounts = overview.accounts.map(normalizeAccount)

  // 2. Positions (with cash-on-account breakdown) — single call covers all accounts.
  const positions = await api.get<AvanzaPositionsResponse>(paths.POSITIONS)
  const balances = normalizeBalances(overview, positions)
  const { positions: normPositions, instruments: posInstruments } =
    normalizePositionsAndInstruments(positions)

  // 3. Transactions per account in the requested window.
  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)

  const perAccountTxs = await Promise.all(
    overview.accounts.map(async (a) => {
      const path = templatePath(paths.TRANSACTIONS, { accountOrType: a.accountId })
      const qs = new URLSearchParams({ from: dateFrom, to: dateTo }).toString()
      try {
        return await api.get<AvanzaTransactionsResponse>(`${path}?${qs}`)
      } catch (e) {
        // Don't fail the whole sync if one account's tx fetch errors;
        // that'd let a corrupt sub-account torpedo the rest.
        return { transactions: [], error: (e as Error).message } as AvanzaTransactionsResponse & {
          error?: string
        }
      }
    }),
  )

  const transactions = []
  const instrumentMap = new Map<string, NormalizedInstrument>()
  for (const i of posInstruments) instrumentMap.set(i.id, i)

  for (const resp of perAccountTxs) {
    for (const t of resp.transactions ?? []) {
      const { transaction, instrument } = normalizeTransaction(t)
      if (transaction) transactions.push(transaction)
      if (instrument && !instrumentMap.has(instrument.id)) {
        instrumentMap.set(instrument.id, instrument)
      }
    }
  }

  return {
    accounts,
    balances,
    transactions,
    instruments: Array.from(instrumentMap.values()),
    positions: normPositions,
    syncWindow: { from: dateFrom, to: dateTo },
  }
}
