'use client'
// Aloma desktop layout. Sidebar (logo, person sections) on the left.
// Main panel (topbar, growth chart, summary cards) on the right. Mobile
// gets its own layout with a tab-strip view switcher above the chart.
//
// All bucketing/totals come from /api/dashboard — this component just
// routes data + UI state. The chart is controlled by the per-account
// eye toggles in the sidebar; on mobile the view tabs additionally
// re-label the topbar number/delta.

import { useState } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { MobileDashboardSkeleton } from './components/MobileDashboardSkeleton'
import { MobileLayout } from './components/MobileLayout'
import { Sidebar, type ViewSelection } from './components/Sidebar'
import { Timeline, type TimelineSnapshot } from './components/Timeline'
import { Topbar } from './components/Topbar'
import { SummaryCards, buildSummaryRows } from './components/SummaryCards'
import { type ChangeMode } from './components/ChangeModeToggle'
import { ChangeModeProvider } from './components/change-mode-context'
import { type Period } from './components/PeriodTabs'
import { Alert } from '@/components/ui/alert'
import {
  useBulkToggleExclude,
  useDashboard,
  useSyncAll,
  useToggleExclude,
} from '@/lib/queries'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { useConnectedConfetti } from '@/hooks/use-connected-confetti'

const EMPTY_SNAP: TimelineSnapshot = {
  total: null,
  shared: null,
  byHolder: {},
  currency: null,
}

export function HomeContent({
  initialError,
  initialSidebarWidth,
}: {
  initialError: string | null
  initialSidebarWidth: number
}) {
  const [period, setPeriod] = useState<Period>('1Y')
  const [view, setView] = useState<ViewSelection>('all')
  // Persisted via localStorage so the Settings page can flip it from
  // /settings (different route, can't share React state otherwise).
  const [showCombined, setShowCombined] = useLocalStorage<boolean>('aloma:show-combined', true)
  const [legendHolders, setLegendHolders] = useLocalStorage<Record<string, boolean>>(
    'aloma:legend-holders',
    {},
  )
  const [showShared, setShowShared] = useLocalStorage<boolean>('aloma:legend-shared', false)
  const [changeMode, setChangeMode] = useLocalStorage<ChangeMode>('aloma:change-mode', 'abs')
  const [pageError, setPageError] = useState<string | null>(initialError)
  const [snap, setSnap] = useState<TimelineSnapshot>(EMPTY_SNAP)

  const dashboard = useDashboard(period)
  const syncAll = useSyncAll()
  const toggleExclude = useToggleExclude()
  const bulkToggleExclude = useBulkToggleExclude()

  const data = dashboard.data

  useConnectedConfetti()

  function onToggleAccount(a: DashboardAccount) {
    toggleExclude.mutate({ id: a.id, exclude: !a.excludedFromTotal })
  }

  function bulkToggle(predicate: (a: DashboardAccount) => boolean) {
    if (!data) return
    const owned: DashboardAccount[] = []
    for (const h of data.holders) {
      for (const a of h.accounts) if (predicate(a)) owned.push(a)
    }
    for (const a of data.shared.accounts) if (predicate(a)) owned.push(a)

    const shouldExclude = owned.some((a) => !a.excludedFromTotal)
    const items = owned
      .filter((a) => a.excludedFromTotal !== shouldExclude)
      .map((a) => ({ id: a.id, exclude: shouldExclude }))
    if (items.length === 0) return
    bulkToggleExclude.mutate(items)
  }

  function onToggleAllForHolder(holderId: string) {
    bulkToggle((a) => a.bucket.kind === 'holder' && a.bucket.holderId === holderId)
  }

  function onToggleAllShared() {
    bulkToggle((a) => a.bucket.kind === 'shared' && !a.possibleDuplicateOf)
  }

  // Topbar values: pick the slice that matches the current view. The
  // displayed total tracks the chart's latest point (via snap) so the
  // topbar number stays anchored to the chart, but change comes from
  // the dashboard's deposit-adjusted bucket math (single source of truth).
  const { topbarTotal, topbarChange, topbarLabel } = pickTopbarSlice()

  function pickTopbarSlice() {
    if (view === 'all') {
      return {
        topbarTotal: snap.total,
        topbarChange: data?.totals.change ?? null,
        topbarLabel: 'All Accounts',
      }
    }
    if (view === 'shared') {
      return {
        topbarTotal: snap.shared,
        topbarChange: data?.shared.change ?? null,
        topbarLabel: 'Shared',
      }
    }
    const holder = data?.holders.find((h) => h.id === view)
    return {
      topbarTotal: snap.byHolder[view] ?? null,
      topbarChange: holder?.change ?? null,
      topbarLabel: holder?.label ?? 'Total balance',
    }
  }

  const summaryRows = data
    ? buildSummaryRows({
        totalAll: snap.total ?? data.totals.total,
        changeAll: data.totals.change,
        holders: data.holders,
      })
    : []

  // Chart line visibility is user-controlled via the legend (clickable
  // dots in Timeline). Combined defaults on; per-holder + Shared default
  // off and turn on when the user clicks their legend item.
  const visibleHolderIds = data
    ? data.holders.filter((h) => legendHolders[h.id] ?? false).map((h) => h.id)
    : []
  const onToggleCombined = () => setShowCombined((v) => !v)
  const onToggleShared = () => setShowShared((v) => !v)
  const onToggleHolder = (id: string) =>
    setLegendHolders((m) => ({ ...m, [id]: !(m[id] ?? false) }))

  const topError =
    pageError ??
    dashboard.error?.message ??
    syncAll.error?.message ??
    toggleExclude.error?.message ??
    bulkToggleExclude.error?.message ??
    null

  return (
    <ChangeModeProvider value={changeMode}>
      {data ? (
        <>
          {/* Desktop: sidebar + main panel. Hidden below `lg` (1024px). */}
          <div className="hidden h-screen w-screen overflow-hidden lg:flex">
            <Sidebar
              dashboard={data}
              onToggleAllForHolder={onToggleAllForHolder}
              onToggleAllShared={onToggleAllShared}
              onToggleAccount={onToggleAccount}
              onSyncAll={() => syncAll.mutate()}
              syncingAll={syncAll.isPending}
              initialWidth={initialSidebarWidth}
            />

            <main className="flex flex-1 flex-col overflow-hidden">
              <Topbar
                label={topbarLabel}
                total={topbarTotal}
                change={topbarChange}
                currency={snap.currency ?? data.baseCurrency}
                period={period}
                onPeriodChange={setPeriod}
                changeMode={changeMode}
                onChangeModeChange={setChangeMode}
              />

              <div className="flex flex-1 flex-col gap-5 overflow-hidden px-7 py-6">
                {topError && (
                  <Alert>
                    <button
                      type="button"
                      className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
                      onClick={() => setPageError(null)}
                      aria-label="Dismiss"
                    >
                      ✕
                    </button>
                    {topError}
                  </Alert>
                )}

                <Timeline
                  period={period}
                  holders={data.holders}
                  showCombined={showCombined}
                  visibleHolderIds={visibleHolderIds}
                  showShared={showShared}
                  onToggleCombined={onToggleCombined}
                  onToggleHolder={onToggleHolder}
                  onToggleShared={onToggleShared}
                  onSnapshotChange={setSnap}
                />

                <SummaryCards rows={summaryRows} period={period} currency={snap.currency} />
              </div>
            </main>
          </div>

          {/* Mobile + tablet: stacked layout matching the Aloma mobile UI kit. */}
          <MobileLayout
            dashboard={data}
            view={view}
            onChangeView={setView}
            period={period}
            onPeriodChange={setPeriod}
            snap={snap}
            showCombined={showCombined}
            visibleHolderIds={visibleHolderIds}
            showShared={showShared}
            onToggleCombined={onToggleCombined}
            onToggleHolder={onToggleHolder}
            onToggleShared={onToggleShared}
            onToggleAccount={onToggleAccount}
            onSyncAll={() => syncAll.mutate()}
            syncingAll={syncAll.isPending}
            topError={topError}
            onDismissError={() => setPageError(null)}
            changeMode={changeMode}
            onChangeModeChange={setChangeMode}
          />
        </>
      ) : (
        <>
          {/* Error overlay during the skeleton state — without this, a
              failed initial /api/dashboard fetch would leave the user
              staring at an infinite shimmer with no way to recover. */}
          {topError && (
            <div className="fixed left-1/2 top-4 z-50 w-[min(35rem,calc(100%-2rem))] -translate-x-1/2">
              <Alert>
                <button
                  type="button"
                  className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
                  onClick={() => setPageError(null)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
                {topError}
              </Alert>
            </div>
          )}
          <DashboardSkeleton sidebarWidth={initialSidebarWidth} />
          <MobileDashboardSkeleton />
        </>
      )}
    </ChangeModeProvider>
  )
}
