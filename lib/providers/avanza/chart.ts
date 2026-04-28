// Wrapper for /_api/account-performance/overview/chart/accounts/timeperiod.
// Returns the daily value series (366 points for ONE_YEAR) for one or
// more Avanza accounts. The chart's `valueSeries` is the actual portfolio
// value on each calendar day — exactly what we need to backfill the
// wealth chart for investment accounts.

import type { AvanzaApi } from './api'
import { paths, type ChartTimePeriod } from './constants'

export interface ChartPoint {
  performance: { value: number; unit: string; unitType: string; decimalPrecision: number }
  timestamp: number // unix ms
}

export interface ChartTimePeriodResponse {
  interval: { timePeriod: string; from: string; to: string }
  timePeriod: string
  earliestAvailableDate?: string
  // Total portfolio value per day (calendar days, ~366 for ONE_YEAR).
  valueSeries: ChartPoint[]
  // Absolute SEK gain since the beginning of the period (per trading day).
  absoluteSeries: ChartPoint[]
  // Percentage gain since the beginning of the period (per trading day).
  relativeSeries: ChartPoint[]
}

export function fetchChartTimeperiod(
  api: AvanzaApi,
  scrambledAccountIds: string[],
  timePeriod: ChartTimePeriod = 'ONE_YEAR',
): Promise<ChartTimePeriodResponse> {
  return api.post<ChartTimePeriodResponse>(paths.CHART_TIMEPERIOD, {
    timePeriod,
    scrambledAccountIds,
  })
}

// Convert a chart timestamp (unix ms) to a YYYY-MM-DD string in UTC.
export function chartDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}
