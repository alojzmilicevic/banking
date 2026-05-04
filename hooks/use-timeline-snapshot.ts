import { useMemo } from 'react'
import { useTimeseries } from '@/lib/queries'
import type { DashboardHolder, TimeseriesPoint } from '@/lib/api/dashboard'

export interface TimelineSnapshot {
  total: number | null
  shared: number | null
  byHolder: Record<string, number | null>
  changeByKey: Record<string, { absolute: number | null; pct: number | null } | null>
  currency: string | null
  changeAbsolute: number | null
  changePct: number | null
}

export interface ChartPoint extends TimeseriesPoint {
  // Recharts wants flat-keyed data; we spread byHolder so dataKey={holderId}
  // works directly. Index signature carries those holder keys.
  [holderId: string]: unknown
}

export interface TimelineData {
  snap: TimelineSnapshot
  chartData: ChartPoint[]
  isLoading: boolean
  error: Error | null
  errors: string[]
  hasSeries: boolean
}

const EMPTY_SNAP: TimelineSnapshot = {
  total: null,
  shared: null,
  byHolder: {},
  changeByKey: {},
  currency: null,
  changeAbsolute: null,
  changePct: null,
}

function deltaPct(now: number | null, then: number | null): number | null {
  if (now == null || then == null || then === 0 || !Number.isFinite((now - then) / then)) {
    return null
  }
  return Math.round(((now - then) / Math.abs(then)) * 10000) / 100
}

// Computes the snapshot + flat chart-ready point array from a timeseries
// query. Lifted out of <Timeline> so the snapshot can be derived once at
// the page level — both desktop and mobile chart instances now share a
// single computation, and the topbar/summary cards consume `snap` directly
// without a useEffect-based callback.
export function useTimelineSnapshot(
  period: string,
  holders: DashboardHolder[],
): TimelineData {
  const { data, error, isLoading } = useTimeseries(period)

  return useMemo<TimelineData>(() => {
    const series = data?.series ?? []
    if (series.length === 0) {
      return {
        snap: { ...EMPTY_SNAP, currency: data?.currency ?? null },
        chartData: [],
        isLoading,
        error: error ?? null,
        errors: data?.errors ?? [],
        hasSeries: false,
      }
    }

    const last = series[series.length - 1]
    const first = series[0]

    const total = last.total ?? null
    const startTotal = first.total ?? null
    const shared = last.shared ?? null
    const startShared = first.shared ?? null
    const currency = data?.currency ?? null

    const changeAbsolute =
      total != null && startTotal != null
        ? Math.round((total - startTotal) * 100) / 100
        : null
    const changePct = deltaPct(total, startTotal)

    const byHolder: Record<string, number | null> = {}
    const changeByKey: Record<
      string,
      { absolute: number | null; pct: number | null } | null
    > = {
      all: { absolute: changeAbsolute, pct: changePct },
      shared:
        shared != null && startShared != null
          ? {
              absolute: Math.round((shared - startShared) * 100) / 100,
              pct: deltaPct(shared, startShared),
            }
          : null,
    }
    for (const h of holders) {
      const now = last.byHolder[h.id] ?? null
      const then = first.byHolder[h.id] ?? null
      byHolder[h.id] = now
      changeByKey[h.id] =
        now != null && then != null
          ? {
              absolute: Math.round((now - then) * 100) / 100,
              pct: deltaPct(now, then),
            }
          : null
    }

    const chartData: ChartPoint[] = series.map((p) => ({
      ...p,
      ...p.byHolder,
    }))

    return {
      snap: {
        total,
        shared,
        byHolder,
        changeByKey,
        currency,
        changeAbsolute,
        changePct,
      },
      chartData,
      isLoading,
      error: error ?? null,
      errors: data?.errors ?? [],
      hasSeries: true,
    }
  }, [data, error, isLoading, holders])
}
