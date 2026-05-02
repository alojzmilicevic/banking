import { AvanzaApi, type AvanzaSession } from './api'
import { paths } from './constants'
import { chartDate, fetchChartTimeperiod } from './chart'
import {
  normalizeAccount,
  normalizeBalances,
  type AvanzaCategorizedAccount,
  type AvanzaCategorizedAccountsResponse,
} from './normalize'
import type {
  ConnectionContext,
  NormalizedDailyValue,
  SyncOptions,
  SyncResult,
} from '../types'
import { AuthExpiredError } from '@/lib/sync/errors'

interface AvanzaConnectionMeta {
  expiresAt?: number
  // Legacy: connections created before encryption was wired in held the
  // full session here in plaintext. Read-only fallback path.
  session?: AvanzaSession
}

export async function avanzaSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  const meta = JSON.parse(connection.rawJson || '{}') as AvanzaConnectionMeta

  // Preferred path: orchestrator hands us decrypted credentials.
  // Fallback: legacy plaintext rawJson.session (will be migrated next
  // time the user re-links).
  const fromCreds = connection.credentials as
    | { cookies?: Record<string, string> }
    | undefined
  const cookies = fromCreds?.cookies ?? meta.session?.cookies

  if (!cookies || Object.keys(cookies).length === 0) {
    throw new AuthExpiredError(
      'Avanza connection has no cookies — re-link via Read from Chrome / paste cookies',
    )
  }

  // No wall-clock expiry precheck: Avanza's session cookies don't carry a
  // client-readable lifetime. Let the API call fail naturally if the jar
  // is stale, and the orchestrator surfaces an auth-shaped error.
  const session: AvanzaSession = { cookies, expiresAt: 0 }
  const api = new AvanzaApi(session)

  // Account list + current balances.
  const resp = await api.get<AvanzaCategorizedAccountsResponse>(paths.CATEGORIZED_ACCOUNTS)

  const accounts = resp.accounts.map(normalizeAccount)
  const balances = resp.accounts.flatMap(normalizeBalances)

  // Historical daily values per account — Avanza's chart endpoint.
  // Always request ONE_YEAR: the chart returns whatever range the account
  // actually has data for (often less for newer accounts), and rows are
  // UPSERTed into account_value_history so the cache only grows. Asking
  // for a shorter window on incremental syncs would just leave gaps.
  const dailyValues = await fetchDailyValueSeries(api, resp.accounts, 'ONE_YEAR')

  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)

  return {
    accounts,
    balances,
    transactions: [],
    instruments: [],
    positions: [],
    dailyValues,
    // Round-trip whatever the cookie jar looks like now — AZACSRF in
    // particular gets refreshed mid-sync, and dropping the new value here
    // means the next sync would still send the stale one and fail CSRF.
    refreshedCredentials: { cookies: api.cookieMap() },
    // Successful sync ⇒ session is alive *now*. The UI's "consent
    // expired" warning should fire ~60min after the last working sync,
    // which lines up with Avanza's typical idle timeout.
    connectionValidUntil: Date.now() + 60 * 60 * 1000,
    syncWindow: { from: dateFrom, to: dateTo },
  }
}

async function fetchDailyValueSeries(
  api: AvanzaApi,
  accounts: AvanzaCategorizedAccount[],
  period: 'ONE_WEEK' | 'ONE_MONTH' | 'THREE_MONTHS' | 'ONE_YEAR',
): Promise<NormalizedDailyValue[]> {
  // urlParameterId is what the chart endpoint expects.
  const idMap = new Map<string, AvanzaCategorizedAccount>()
  for (const a of accounts) {
    if (a.urlParameterId) idMap.set(a.urlParameterId, a)
  }
  if (idMap.size === 0) return []

  let chart
  try {
    chart = await fetchChartTimeperiod(api, Array.from(idMap.keys()), period)
  } catch (e) {
    // Don't fail the whole sync if the chart endpoint regressed; we still
    // have today's totals. Log and move on.
    console.warn('[avanza] chart/timeperiod failed:', (e as Error).message)
    return []
  }

  // The chart API returns the SUMMED valueSeries when multiple accounts
  // are passed. For a per-account history we'd need to call once per
  // account. Trade-off: 1 call vs N calls. We do per-account calls so the
  // daily_account_values table is correctly populated.
  const out: NormalizedDailyValue[] = []
  if (idMap.size === 1) {
    // Single-call path — already fetched.
    const a = Array.from(idMap.values())[0]
    for (const p of chart.valueSeries) {
      out.push({
        accountId: a.id,
        date: chartDate(p.timestamp),
        value: p.performance.value,
        currency: p.performance.unit,
      })
    }
    return out
  }

  // Multi-account: fetch each account's chart separately so we can attribute
  // daily values per account.
  const perAccount = await Promise.all(
    Array.from(idMap.entries()).map(async ([scrambledId, account]) => {
      try {
        const r = await fetchChartTimeperiod(api, [scrambledId], period)
        return { account, series: r.valueSeries }
      } catch (e) {
        console.warn(`[avanza] chart for ${account.id} failed:`, (e as Error).message)
        return { account, series: [] }
      }
    }),
  )

  for (const { account, series } of perAccount) {
    for (const p of series) {
      out.push({
        accountId: account.id,
        date: chartDate(p.timestamp),
        value: p.performance.value,
        currency: p.performance.unit,
      })
    }
  }
  return out
}
