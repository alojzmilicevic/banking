'use client'
// Aloma desktop layout. Sidebar (logo, view switcher, person sections,
// combined-line toggle) on the left. Main panel (topbar, growth chart,
// summary cards) on the right.
//
// All bucketing/totals come from /api/dashboard now — this component
// just routes data + UI state. The view switcher only re-labels the
// topbar number/delta; the chart is controlled by the per-account eye
// toggles + the combined-line toggle in the sidebar.

import { useState } from 'react'
import { AccountSettingsModal } from './components/AccountSettingsModal'
import { AddBankModal } from './components/AddBankModal'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { DismissibleAlert } from './components/DismissibleAlert'
import { MobileDashboardSkeleton } from './components/MobileDashboardSkeleton'
import { MobileLayout } from './components/MobileLayout'
import { Sidebar, type ViewSelection } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import { Topbar } from './components/Topbar'
import { SummaryCards, buildSummaryRows } from './components/SummaryCards'
import { type Period } from './components/PeriodTabs'
import {
  useDashboard,
  useDisconnect,
  useSyncAll,
  useToggleExclude,
} from '@/lib/queries'
import { useTimelineSnapshot } from '@/hooks/use-timeline-snapshot'
import { useTopbarSlice } from '@/hooks/use-topbar-slice'
import { useConnectedConfetti } from '@/hooks/use-connected-confetti'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { celebrate } from '@/lib/animation/confetti'

export function HomeContent({
  initialError,
  initialSidebarWidth,
}: {
  initialError: string | null
  initialSidebarWidth: number
}) {
  const [period, setPeriod] = useState<Period>('1Y')
  const [view, setView] = useState<ViewSelection>('all')
  const [showCombined, setShowCombined] = useState(true)
  const [pageError, setPageError] = useState<string | null>(initialError)
  const [addOpen, setAddOpen] = useState(false)
  const [addHolderId, setAddHolderId] = useState<string | undefined>(undefined)
  const [activeAccount, setActiveAccount] = useState<DashboardAccount | null>(null)

  const dashboard = useDashboard()
  const syncAll = useSyncAll()
  const disconnect = useDisconnect()
  const toggleExclude = useToggleExclude()

  const data = dashboard.data
  const holders = data?.holders ?? []

  // Single source of truth for the snapshot + chart data — both desktop
  // and mobile Timelines render from the same precomputed values.
  const tl = useTimelineSnapshot(period, holders)
  const slice = useTopbarSlice(tl.snap, view, holders)

  useConnectedConfetti()

  function openAdd(holderId?: string) {
    setAddHolderId(holderId)
    setAddOpen(true)
  }

  function onToggleAccount(a: DashboardAccount) {
    toggleExclude.mutate({ id: a.id, exclude: !a.excludedFromTotal })
  }

  function onDisconnectActive() {
    if (!activeAccount) return
    const c = activeAccount.connection
    if (
      !confirm(
        `Disconnect ${c.label ?? c.providerId}?\n\nThis deletes its accounts, transactions and history. Snapshot history is recomputed on next sync.`,
      )
    )
      return
    disconnect.mutate(c.id)
    setActiveAccount(null)
  }

  function bulkToggle(predicate: (a: DashboardAccount) => boolean) {
    if (!data) return
    const owned: DashboardAccount[] = []
    for (const h of data.holders) {
      for (const a of h.accounts) if (predicate(a)) owned.push(a)
    }
    for (const a of data.shared.accounts) if (predicate(a)) owned.push(a)

    const anyVisible = owned.some((a) => !a.excludedFromTotal)
    for (const a of owned) {
      const shouldExclude = anyVisible
      if (a.excludedFromTotal === shouldExclude) continue
      toggleExclude.mutate({ id: a.id, exclude: shouldExclude })
    }
  }

  function onToggleAllForHolder(holderId: string) {
    bulkToggle((a) => a.bucket.kind === 'holder' && a.bucket.holderId === holderId)
  }

  function onToggleAllShared() {
    bulkToggle((a) => a.bucket.kind === 'shared' && !a.possibleDuplicateOf)
  }

  const summaryRows = data
    ? buildSummaryRows({
        totalAll: tl.snap.total ?? data.totals.total,
        pctAll: tl.snap.changePct,
        holders: data.holders,
        pctByHolder: Object.fromEntries(
          data.holders.map((h) => [h.id, tl.snap.changeByKey[h.id]?.pct ?? null]),
        ),
      })
    : []

  // Chart line visibility — light up a per-holder/shared line whenever
  // that bucket has any non-excluded canonical accounts. Server already
  // pre-filtered dupes via `possibleDuplicateOf`, so the predicate is
  // simple here.
  function holderHasVisible(accs: DashboardAccount[]) {
    return accs.some((a) => !a.excludedFromTotal && !a.possibleDuplicateOf)
  }
  const visibleHolderIds = data
    ? data.holders.filter((h) => holderHasVisible(h.accounts)).map((h) => h.id)
    : []
  const showShared = data ? holderHasVisible(data.shared.accounts) : false

  const topError =
    pageError ??
    dashboard.error?.message ??
    syncAll.error?.message ??
    disconnect.error?.message ??
    toggleExclude.error?.message ??
    null

  return (
    <>
      {data ? (
        <>
          {/* Desktop: sidebar + main panel. Hidden below `lg` (1024px). */}
          <div className="hidden h-screen w-screen overflow-hidden lg:flex">
            <Sidebar
              dashboard={data}
              view={view}
              onChangeView={setView}
              showCombined={showCombined}
              onToggleCombined={() => setShowCombined((v) => !v)}
              onToggleAllForHolder={onToggleAllForHolder}
              onToggleAllShared={onToggleAllShared}
              onAddAccount={openAdd}
              initialWidth={initialSidebarWidth}
              onOpenAccountSettings={(account) => setActiveAccount(account)}
            />

            <main className="flex flex-1 flex-col overflow-hidden">
              <Topbar
                label={slice.label}
                total={slice.total}
                delta={slice.delta}
                pct={slice.pct}
                currency={tl.snap.currency}
                period={period}
                onPeriodChange={setPeriod}
              />

              <div className="flex flex-1 flex-col gap-5 overflow-hidden px-7 py-6">
                {topError && (
                  <DismissibleAlert message={topError} onDismiss={() => setPageError(null)} />
                )}

                <Timeline
                  period={period}
                  holders={data.holders}
                  showCombined={showCombined}
                  visibleHolderIds={visibleHolderIds}
                  showShared={showShared}
                  chartData={tl.chartData}
                  currency={tl.snap.currency}
                  isLoading={tl.isLoading}
                  error={tl.error}
                  errors={tl.errors}
                />

                <SummaryCards rows={summaryRows} period={period} currency={tl.snap.currency} />
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
            snap={tl.snap}
            showCombined={showCombined}
            visibleHolderIds={visibleHolderIds}
            showShared={showShared}
            onAddAccount={openAdd}
            onOpenAccountSettings={(account) => setActiveAccount(account)}
            topError={topError}
            onDismissError={() => setPageError(null)}
            chartData={tl.chartData}
            chartIsLoading={tl.isLoading}
            chartError={tl.error}
            chartErrors={tl.errors}
          />
        </>
      ) : (
        <>
          {/* Error overlay during the skeleton state — without this, a
              failed initial /api/dashboard fetch would leave the user
              staring at an infinite shimmer with no way to recover. */}
          {topError && (
            <div className="fixed left-1/2 top-4 z-50 w-[min(35rem,calc(100%-2rem))] -translate-x-1/2">
              <DismissibleAlert message={topError} onDismiss={() => setPageError(null)} />
            </div>
          )}
          <DashboardSkeleton sidebarWidth={initialSidebarWidth} />
          <MobileDashboardSkeleton />
        </>
      )}

      <AddBankModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConnected={() => celebrate()}
        initialHolderId={addHolderId}
      />

      <AccountSettingsModal
        account={activeAccount}
        onClose={() => setActiveAccount(null)}
        onToggleHide={() => {
          if (!activeAccount) return
          onToggleAccount(activeAccount)
          setActiveAccount(null)
        }}
        onDisconnect={onDisconnectActive}
        toggling={toggleExclude.isPending}
        disconnecting={disconnect.isPending}
      />
    </>
  )
}
