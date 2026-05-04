import type { DashboardHolder } from '@/lib/api/dashboard'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import type { TimelineSnapshot } from '@/app/components/Timeline'
import type { ViewSelection } from '@/app/components/Sidebar'

export interface TopbarSlice {
  total: number | null
  delta: number | null
  pct: number | null
  label: string
  positive: boolean
  showPct: boolean
}

// Picks the slice of a TimelineSnapshot that matches the active view, plus
// the human-readable label and a couple of presentation flags. Used by
// both the desktop Topbar and the mobile balance hero.
export function useTopbarSlice(
  snap: TimelineSnapshot,
  view: ViewSelection,
  holders: DashboardHolder[],
): TopbarSlice {
  const total =
    view === 'all'
      ? snap.total
      : view === 'shared'
        ? snap.shared
        : (snap.byHolder[view] ?? null)
  const change = snap.changeByKey[view] ?? null
  const delta = change?.absolute ?? null
  const pct = change?.pct ?? null

  const label =
    view === 'all'
      ? COMBINED_META.label
      : view === 'shared'
        ? SHARED_META.label
        : (holders.find((h) => h.id === view)?.label ?? 'Total balance')

  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  return { total, delta, pct, label, positive, showPct }
}
