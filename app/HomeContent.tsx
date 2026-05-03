'use client'
// Aloma desktop layout. Sidebar (logo, view switcher, person sections,
// combined-line toggle) on the left. Main panel (topbar, growth chart,
// summary cards) on the right.
//
// All bucketing/totals come from /api/dashboard now — this component
// just routes data + UI state. The view switcher only re-labels the
// topbar number/delta; the chart is controlled by the per-account eye
// toggles + the combined-line toggle in the sidebar.

import { useEffect, useMemo, useState } from 'react'
import AccountSettingsModal from './components/AccountSettingsModal'
import AddBankModal from './components/AddBankModal'
import MobileLayout from './components/MobileLayout'
import Sidebar, { type ViewSelection } from './components/Sidebar'
import Timeline, { type TimelineSnapshot } from './components/Timeline'
import Topbar from './components/Topbar'
import SummaryCards, { buildSummaryRows } from './components/SummaryCards'
import { type Period } from './components/PeriodTabs'
import { Alert } from '@/components/ui/alert'
import {
  useAvanzaPing,
  useDashboard,
  useDisconnect,
  useSyncAll,
  useToggleExclude,
} from '@/lib/queries'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { celebrate } from '@/lib/animation/confetti'

const EMPTY_SNAP: TimelineSnapshot = {
  total: null,
  shared: null,
  byHolder: {},
  changeByKey: {},
  currency: null,
  changeAbsolute: null,
  changePct: null,
}

export default function HomeContent({
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
  const [snap, setSnap] = useState<TimelineSnapshot>(EMPTY_SNAP)
  const [addOpen, setAddOpen] = useState(false)
  const [addHolderId, setAddHolderId] = useState<string | undefined>(undefined)
  const [activeAccount, setActiveAccount] = useState<DashboardAccount | null>(null)

  const dashboard = useDashboard()
  const syncAll = useSyncAll()
  const disconnect = useDisconnect()
  const toggleExclude = useToggleExclude()

  const data = dashboard.data
  const hasAvanza = useMemo(() => {
    if (!data) return false
    for (const h of data.holders) {
      if (h.accounts.some((a) => a.connection.providerId === 'avanza')) return true
    }
    return data.shared.accounts.some((a) => a.connection.providerId === 'avanza')
  }, [data])
  // Background keepalive — only runs when an Avanza connection exists.
  useAvanzaPing(hasAvanza)

  // Fire confetti once if we just landed from a successful OAuth callback.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('connected')) {
      celebrate()
      const url = new URL(window.location.href)
      url.searchParams.delete('connected')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

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

  // Topbar values: pick the slice that matches the current view.
  const topbarTotal =
    view === 'all'
      ? snap.total
      : view === 'shared'
        ? snap.shared
        : snap.byHolder[view] ?? null
  const topbarChange = snap.changeByKey[view] ?? null
  const topbarDelta = topbarChange?.absolute ?? null
  const topbarPct = topbarChange?.pct ?? null
  const topbarLabel =
    view === 'all'
      ? 'All Accounts'
      : view === 'shared'
        ? 'Shared'
        : data?.holders.find((h) => h.id === view)?.label ?? 'Total balance'

  const summaryRows = data
    ? buildSummaryRows({
        totalAll: snap.total ?? data.totals.total,
        pctAll: snap.changePct,
        holders: data.holders,
        pctByHolder: Object.fromEntries(
          data.holders.map((h) => [h.id, snap.changeByKey[h.id]?.pct ?? null]),
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

  // Empty placeholder until the first /api/dashboard fetch resolves.
  const empty = !data

  return (
    <>
      {/* Desktop: sidebar + main panel. Hidden below `lg` (1024px). */}
      <div className="hidden h-screen w-screen overflow-hidden lg:flex">
        {data && (
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
        )}

        <main className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            label={topbarLabel}
            total={topbarTotal}
            delta={topbarDelta}
            pct={topbarPct}
            currency={snap.currency}
            period={period}
            onPeriodChange={setPeriod}
          />

          <div className="flex flex-1 flex-col gap-5 overflow-hidden p-[24px_28px]">
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

            {data && (
              <>
                <Timeline
                  period={period}
                  holders={data.holders}
                  showCombined={showCombined}
                  visibleHolderIds={visibleHolderIds}
                  showShared={showShared}
                  onSnapshotChange={setSnap}
                />

                <SummaryCards rows={summaryRows} period={period} currency={snap.currency} />
              </>
            )}

            {empty && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </div>
        </main>
      </div>

      {/* Mobile + tablet: stacked layout matching the Aloma mobile UI kit. */}
      {data && (
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
          onAddAccount={openAdd}
          onOpenAccountSettings={(account) => setActiveAccount(account)}
          topError={topError}
          onDismissError={() => setPageError(null)}
        />
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
