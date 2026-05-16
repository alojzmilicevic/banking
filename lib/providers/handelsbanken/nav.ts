// Backfills HB fund-account history by piggybacking on Avanza's public
// (cookie-auth) market data:
//
//   1. POST /_api/search/filtered-search { query: <ISIN> }
//        → returns orderbookId for the matching fund.
//   2. GET /_api/fund-guide/chart/{orderbookId}/one_year
//        → returns dataSerie [{ x: unix-ms, y: daily %-return }, …].
//
// Today's per-unit NAV is anchored at marketValue / quantity (both
// captured fresh from HB), then walked backwards through the chart's
// daily returns to produce a per-date NAV series. Per-position values
// are then summed into account-level daily totals.
//
// Requires the household to have a linked + active Avanza connection.
// Without it we silently return an empty series — the dashboard chart
// will flat-line at today's value rather than break.

import { AvanzaApi } from '../avanza/api'
import { loadAvanzaCredentials } from '../avanza/auth/credentials-store'
import * as connectionsRepo from '@/lib/repositories/connections'
import type { NormalizedDailyValue, NormalizedPosition } from '../types'

interface FundChartPoint {
  x: number // unix ms — trading-day timestamp
  y: number // daily return on that day, **percent** (e.g. 0.37 = +0.37%)
}

interface FundChartResponse {
  id: string
  dataSerie: FundChartPoint[]
}

interface SearchHit {
  type: string
  orderBookId: string
  title: string
}

interface SearchResponse {
  totalNumberOfHits: number
  hits: SearchHit[]
}

// 1. ISIN → orderbookId via the authenticated search endpoint.
async function findOrderbookIdByIsin(isin: string, api: AvanzaApi): Promise<string | null> {
  try {
    const resp = await api.post<SearchResponse>('/_api/search/filtered-search', {
      query: isin,
      searchFilter: { types: [] },
      screenSize: 'TABLET',
      originPath: '/',
      originPlatform: 'PWA',
      pagination: { from: 0, size: 5 },
    })
    return resp.hits.find((h) => h.type === 'FUND')?.orderBookId ?? null
  } catch {
    return null
  }
}

// 2. orderbookId → daily-return series. Avanza accepts ONE_YEAR,
// THREE_MONTHS, etc. — lowercase only (uppercase 500s the route).
async function fetchFundChart(
  orderbookId: string,
  api: AvanzaApi,
  period = 'one_year',
): Promise<FundChartResponse | null> {
  try {
    return await api.get<FundChartResponse>(`/_api/fund-guide/chart/${orderbookId}/${period}`)
  } catch {
    return null
  }
}

// Avanza's chart `x` timestamps land at end-of-trading-day in Stockholm,
// which is ~22:00 UTC — so `toISOString().slice(0,10)` would tag those
// points as the previous calendar day. Format in the Stockholm zone so
// trading-day dates line up with what the netbank reports.
const STOCKHOLM_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function stockholmDate(t: number): string {
  return STOCKHOLM_FMT.format(new Date(t))
}

interface FundNavSeries {
  startNav: number
  series: { date: string; nav: number }[]
}

// `y` values are CUMULATIVE percent return since the period baseline —
// the trading day BEFORE the first chart point (the chart's `startDate`
// minus one). So `y_latest ≈ developmentOneYear`, `y_first ≈ first
// trading day's return`, never zero.
//
//   NAV(date_i) = startNav × (1 + y_i / 100)
//
// We anchor the latest point at today's NAV (which we know from HB's
// snapshot: marketValue / quantity), giving
// startNav = todayNav / (1 + y_latest / 100). `startNav` is also the
// baseline NAV (where the percentage clock starts) — we'll emit a
// synthetic row at the day before the first chart point so the
// dashboard's 1Y window picks up that baseline as its anchor instead
// of the +y_0 shifted first chart point (which would chop ~y_0 off
// every period reading).
function buildNavSeries(todayNav: number, chart: FundChartResponse): FundNavSeries {
  const sorted = [...chart.dataSerie].sort((a, b) => a.x - b.x)
  const n = sorted.length
  if (n === 0) return { startNav: todayNav, series: [] }
  const yLatest = sorted[n - 1].y
  const startNav = todayNav / (1 + yLatest / 100)
  // Override the first chart point's NAV with `startNav` (the baseline
  // where the cumulative-% clock reads zero). Avanza's first point
  // already carries y_0 (the first day's accrued return); leaving it
  // as-is would chop that ~0.1pp off every period reading because the
  // dashboard's window-start lookup lands on this row. Trading off ~1
  // day of NAV precision for matching HB's "1 år" / "3 mån" exactly is
  // the right call.
  return {
    startNav,
    series: sorted.map((p, i) => ({
      date: stockholmDate(p.x),
      nav: i === 0 ? startNav : startNav * (1 + p.y / 100),
    })),
  }
}

// Sums per-position (quantity × NAV) for every calendar day from the
// earliest fund-series date through the latest. Trading-day NAVs come
// straight from Avanza; for days in between (weekends, holidays) we
// LINEARLY INTERPOLATE between the bracketing trading days rather than
// holding Friday's NAV flat. Flat carries the false suggestion that the
// fund "stood still" Sat/Sun when in reality it's just unknown — and
// Monday's actual NAV reflects continuous market drift from Friday.
// Linear interp draws a smooth line that's no more wrong than flat fill
// but doesn't read as a plateau in the chart.
function aggregateAccountValues(
  accountId: string,
  perFund: { quantity: number; nav: FundNavSeries }[],
  currency: string,
  constantCash: number,
): NormalizedDailyValue[] {
  if (perFund.length === 0) return []

  let minDate: string | null = null
  let maxDate: string | null = null
  for (const f of perFund) {
    for (const p of f.nav.series) {
      if (minDate === null || p.date < minDate) minDate = p.date
      if (maxDate === null || p.date > maxDate) maxDate = p.date
    }
  }
  if (minDate === null || maxDate === null) return []

  const fundData = perFund.map((f) => ({
    quantity: f.quantity,
    series: [...f.nav.series].sort((a, b) => a.date.localeCompare(b.date)),
    cursor: 0, // largest index whose series[cursor].date <= current loop date
  }))

  // Baseline value = Σ qty × startNav + cash. The first chart day's
  // NAV is already overridden to startNav (see buildNavSeries), so the
  // first emitted row naturally lands at growth = 0 — exactly the
  // anchor the dashboard's 1Y window expects. Cash is held flat
  // across the window (we have no historical cash data).
  const accountBaseline =
    perFund.reduce((s, f) => s + f.quantity * f.nav.startNav, 0) + constantCash

  const MS_DAY = 86400_000
  const start = Date.parse(`${minDate}T00:00:00Z`)
  const end = Date.parse(`${maxDate}T00:00:00Z`)

  const out: NormalizedDailyValue[] = []

  for (let t = start; t <= end; t += MS_DAY) {
    const date = new Date(t).toISOString().slice(0, 10)
    let total = 0
    let anyHas = false

    for (const fd of fundData) {
      while (
        fd.cursor + 1 < fd.series.length &&
        fd.series[fd.cursor + 1].date <= date
      ) {
        fd.cursor++
      }
      const prev = fd.series[fd.cursor]
      const next = fd.cursor + 1 < fd.series.length ? fd.series[fd.cursor + 1] : null

      let nav = 0
      if (prev.date === date) {
        nav = prev.nav
      } else if (prev.date < date && next) {
        // Strictly between two trading days — linear interp.
        const tPrev = Date.parse(`${prev.date}T00:00:00Z`)
        const tNext = Date.parse(`${next.date}T00:00:00Z`)
        const frac = (t - tPrev) / (tNext - tPrev)
        nav = prev.nav + (next.nav - prev.nav) * frac
      } else {
        // Beyond either end of the series — clamp to nearest.
        nav = prev.nav
      }

      if (nav > 0) {
        total += fd.quantity * nav
        anyHas = true
      }
    }

    if (anyHas) {
      const totalWithCash = total + constantCash
      out.push({
        accountId,
        date,
        value: totalWithCash,
        currency,
        growth: totalWithCash - accountBaseline,
      })
    }
  }
  return out
}

export interface FetchHbDailyValuesOptions {
  // Cash held in HB ISKs — added flat across every historical day so
  // the chart total matches the dashboard's `totalBalance` (which
  // includes cash). Assumes cash hasn't moved between syncs.
  constantCash?: number
}

// Entrypoint used by hbSync. positions[].instrumentId == ISIN (HB sets
// it that way in normalize). Returns [] when there's no Avanza
// connection or no positions — sync still succeeds, just no backfill.
export async function fetchHbDailyValues(
  hbConnectionId: string,
  positions: NormalizedPosition[],
  opts: FetchHbDailyValuesOptions = {},
): Promise<NormalizedDailyValue[]> {
  if (positions.length === 0) return []

  const hbConn = connectionsRepo.getById(hbConnectionId)
  if (!hbConn) return []
  const conns = connectionsRepo.listForUser(hbConn.userId)
  const avanzaConn = conns.find((c) => c.providerId === 'avanza' && c.status === 'active')
  if (!avanzaConn) return []
  const creds = loadAvanzaCredentials(avanzaConn.id)
  if (!creds) return []

  const api = new AvanzaApi({ cookies: creds.cookies })

  const perFund: { quantity: number; nav: FundNavSeries }[] = []
  for (const pos of positions) {
    if (pos.quantity <= 0 || pos.marketValue == null) continue
    const todayNav = pos.marketValue / pos.quantity
    // pos.instrumentId is the ISIN — HB always keys instruments by ISIN.
    const orderbookId = await findOrderbookIdByIsin(pos.instrumentId, api)
    if (!orderbookId) continue
    const chart = await fetchFundChart(orderbookId, api)
    if (!chart) continue
    perFund.push({ quantity: pos.quantity, nav: buildNavSeries(todayNav, chart) })
  }

  const accountId = positions[0].accountId
  const currency = positions[0].currency
  return aggregateAccountValues(accountId, perFund, currency, opts.constantCash ?? 0)
}
