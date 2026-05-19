import { AvanzaApi } from './api'
import { paths } from './constants'
import { chartDate, fetchChartTimeperiod, type ChartTimePeriodResponse } from './chart'
import { loginWithPassword, type AvanzaCredentials } from './auth/login'
import { loadAvanzaCredentials, saveAvanzaCredentials } from './auth/credentials-store'
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
import { clearSyncProgress, setSyncProgress } from '@/lib/sync/progress'

export async function avanzaSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  try {
    return await doSync(connection, opts)
  } catch (e) {
    setSyncProgress(connection.id, { stage: 'error', message: (e as Error).message })
    throw e
  } finally {
    // Hold the terminal state ('done' or 'error') for a beat so the
    // client's last poll catches it, then clear. Without the delay,
    // a fast client poll right after the mutation resolves could
    // race with the clear and see {stage:'idle'} for a single tick.
    setTimeout(() => clearSyncProgress(connection.id), 5_000)
  }
}

async function doSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  // Read creds directly from the encrypted store rather than using
  // connection.credentials. The orchestrator's generic decrypt path
  // works too, but going through credentials-store keeps the Avanza
  // round-trip (sync re-saves a refreshed cookie jar below) symmetric
  // with the load.
  const creds = loadAvanzaCredentials(connection.id)
  if (!creds) {
    throw new AuthExpiredError(
      'Avanza connection has no stored credentials — re-link via Add bank',
    )
  }

  // Avanza's session cookies don't carry a client-readable lifetime, so
  // we don't precheck. Try the first data call with the existing jar; if
  // that fails with auth-expired, transparently re-auth and retry once.
  let api = new AvanzaApi({ cookies: creds.cookies })

  let resp: AvanzaCategorizedAccountsResponse
  setSyncProgress(connection.id, { stage: 'fetching-accounts' })
  try {
    resp = await api.get<AvanzaCategorizedAccountsResponse>(paths.CATEGORIZED_ACCOUNTS)
  } catch (e) {
    if (!(e instanceof AuthExpiredError)) throw e
    setSyncProgress(connection.id, { stage: 'reauth' })
    api = await reauth(creds)
    setSyncProgress(connection.id, { stage: 'fetching-accounts' })
    resp = await api.get<AvanzaCategorizedAccountsResponse>(paths.CATEGORIZED_ACCOUNTS)
  }

  const accounts = resp.accounts.map(normalizeAccount)
  const balances = resp.accounts.flatMap(normalizeBalances)

  // Historical daily values per account — Avanza's chart endpoint.
  // Always request ONE_YEAR: the chart returns whatever range the account
  // actually has data for (often less for newer accounts), and rows are
  // UPSERTed into account_value_history so the cache only grows. Asking
  // for a shorter window on incremental syncs would just leave gaps.
  const dailyValues = await fetchDailyValueSeries(api, resp.accounts, 'ONE_YEAR', (done, total) =>
    setSyncProgress(connection.id, {
      stage: 'fetching-history',
      completed: done,
      total,
    }),
  )

  setSyncProgress(connection.id, { stage: 'done' })

  // Round-trip the live cookie jar back into the credential store —
  // AZACSRF in particular rotates mid-sync, and dropping the new value
  // here would leave the next sync sending the stale one and tripping
  // CSRF. We persist directly rather than via SyncResult.refreshedCredentials
  // so the write is unconditional even if persistSyncResult bails for
  // an unrelated reason.
  saveAvanzaCredentials(connection.id, {
    cookies: api.cookieMap(),
    username: creds.username,
    password: creds.password,
    totpSeed: creds.totpSeed,
  })

  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)

  return {
    accounts,
    balances,
    transactions: [],
    instruments: [],
    positions: [],
    dailyValues,
    // Successful sync ⇒ session is alive *now*. The UI's "consent
    // expired" warning fires ~60min after the last working sync, which
    // lines up with Avanza's typical idle timeout.
    connectionValidUntil: Date.now() + 60 * 60 * 1000,
    syncWindow: { from: dateFrom, to: dateTo },
  }
}

async function reauth(creds: AvanzaCredentials): Promise<AvanzaApi> {
  const result = await loginWithPassword(creds.username, creds.password, creds.totpSeed)
  // Match the link-then-sync path: cookies only, no authenticationSession.
  // api.ts unconditionally sends X-AuthenticationSession when the session
  // carries it, but that header is for legacy /_mobile/* endpoints — the
  // new /_api/account-overview/* family rejects requests that include it
  // with a 401. The link path stores only cookies (auth/index.ts) and
  // works; we mirror that here so reauth produces an equivalent session.
  return new AvanzaApi({ cookies: result.cookies })
}

async function fetchDailyValueSeries(
  api: AvanzaApi,
  accounts: AvanzaCategorizedAccount[],
  period: 'ONE_WEEK' | 'ONE_MONTH' | 'THREE_MONTHS' | 'ONE_YEAR',
  onProgress?: (completed: number, total: number) => void,
): Promise<NormalizedDailyValue[]> {
  // urlParameterId is what the chart endpoint expects.
  const idMap = new Map<string, AvanzaCategorizedAccount>()
  for (const a of accounts) {
    if (a.urlParameterId) idMap.set(a.urlParameterId, a)
  }
  if (idMap.size === 0) return []

  const total = idMap.size
  onProgress?.(0, total)

  let chart
  try {
    chart = await fetchChartTimeperiod(api, Array.from(idMap.keys()), period)
  } catch (e) {
    // Don't fail the whole sync if the chart endpoint regressed; we still
    // have today's totals. Log and move on.
    console.warn('[avanza] chart/timeperiod failed:', (e as Error).message)
    onProgress?.(total, total)
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
    out.push(...mergeValueAndGrowth(a.id, chart.valueSeries, chart.absoluteSeries))
    onProgress?.(1, 1)
    return out
  }

  // Multi-account: fetch each account's chart separately so we can attribute
  // daily values per account. Progress ticks once per resolved fetch
  // (success OR failure) so the counter never stalls if one account's
  // chart endpoint flakes.
  let completed = 0
  const perAccount = await Promise.all(
    Array.from(idMap.entries()).map(async ([scrambledId, account]) => {
      try {
        const r = await fetchChartTimeperiod(api, [scrambledId], period)
        return { account, valueSeries: r.valueSeries, absoluteSeries: r.absoluteSeries }
      } catch (e) {
        console.warn(`[avanza] chart for ${account.id} failed:`, (e as Error).message)
        return { account, valueSeries: [], absoluteSeries: [] }
      } finally {
        completed += 1
        onProgress?.(completed, total)
      }
    }),
  )

  for (const { account, valueSeries, absoluteSeries } of perAccount) {
    out.push(...mergeValueAndGrowth(account.id, valueSeries, absoluteSeries))
  }
  return out
}

// valueSeries is per calendar day (~366 entries for ONE_YEAR); absoluteSeries
// is per trading day (~250) — the cumulative SEK gain since the chart's
// anchor. We zip them by date and carry the last known growth forward across
// weekends/holidays so the dashboard can read a value on any day.
function mergeValueAndGrowth(
  accountId: string,
  valueSeries: ChartTimePeriodResponse['valueSeries'],
  absoluteSeries: ChartTimePeriodResponse['absoluteSeries'],
): NormalizedDailyValue[] {
  const growthByDate = new Map<string, number>()
  for (const p of absoluteSeries) {
    growthByDate.set(chartDate(p.timestamp), p.performance.value)
  }
  const sorted = [...valueSeries].sort((a, b) => a.timestamp - b.timestamp)
  const out: NormalizedDailyValue[] = []
  let lastGrowth: number | null = null
  for (const p of sorted) {
    const date = chartDate(p.timestamp)
    const g = growthByDate.get(date)
    if (g !== undefined) lastGrowth = g
    out.push({
      accountId,
      date,
      value: p.performance.value,
      currency: p.performance.unit,
      growth: lastGrowth,
    })
  }
  return out
}
