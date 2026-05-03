'use client'
// Aloma desktop layout. Sidebar (logo, view switcher, person sections,
// combined-line toggle) on the left. Main panel (topbar, growth chart,
// summary cards) on the right.
//
// The view switcher only re-labels the topbar number/delta — the chart
// is controlled by per-account eye toggles + the combined-line toggle in
// the sidebar (matches the Aloma desktop kit exactly).

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
  useConnections,
  useDisconnect,
  useSyncAll,
  useToggleExclude,
  type AccountSummary,
  type ConnectionView,
  type Holder,
} from '@/lib/queries'
import type { LinkerHolder } from '@/lib/holders'
import { celebrate } from '@/lib/animation/confetti'

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
  const [snap, setSnap] = useState<TimelineSnapshot>({
    total: null,
    alma: null,
    alojz: null,
    joint: null,
    currency: null,
    changeAbsolute: null,
    changePct: null,
    almaChangeAbsolute: null,
    almaChangePct: null,
    alojzChangeAbsolute: null,
    alojzChangePct: null,
    jointChangeAbsolute: null,
    jointChangePct: null,
  })
  const [addOpen, setAddOpen] = useState(false)
  const [addHolder, setAddHolder] = useState<LinkerHolder | undefined>(undefined)
  const [activeAccount, setActiveAccount] = useState<{
    account: AccountSummary
    connection: ConnectionView
  } | null>(null)

  const connections = useConnections()
  const syncAll = useSyncAll()
  const disconnect = useDisconnect()
  const toggleExclude = useToggleExclude()

  const conns = useMemo(() => connections.data ?? [], [connections.data])
  const hasAvanza = useMemo(() => conns.some((c) => c.providerId === 'avanza'), [conns])
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

  function openAdd(h?: LinkerHolder) {
    setAddHolder(h)
    setAddOpen(true)
  }

  function onToggleAccount(a: AccountSummary) {
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

  function bulkToggle(predicate: (a: AccountSummary) => boolean) {
    const owned: AccountSummary[] = []
    for (const c of conns) {
      for (const a of c.accounts) {
        if (predicate(a)) owned.push(a)
      }
    }
    const anyVisible = owned.some((a) => !a.excludedFromTotal)
    for (const a of owned) {
      const shouldExclude = anyVisible
      if ((a.excludedFromTotal ?? false) === shouldExclude) continue
      toggleExclude.mutate({ id: a.id, exclude: shouldExclude })
    }
  }

  function onToggleAllForHolder(h: LinkerHolder) {
    // Match the sidebar's bucketing: derivedHolder takes precedence so
    // joint accounts aren't toggled here (they live in the Shared section).
    bulkToggle((a) => {
      const dh = a.derivedHolder
      if (dh === 'joint') return false
      if (dh === 'alma' || dh === 'alojz') return dh === h
      // Fall back to connection holder for accounts without derivedHolder
      // — but we need the connection here. Cheap re-walk:
      for (const c of conns) {
        if (c.accounts.some((x) => x.id === a.id)) return c.holder === h
      }
      return false
    })
  }

  function onToggleAllShared() {
    bulkToggle((a) => a.derivedHolder === 'joint' && !a.possibleDuplicateOf)
  }

  // Topbar values: pick the slice that matches the current view.
  const topbarTotal =
    view === 'all'
      ? snap.total
      : view === 'alma'
        ? snap.alma
        : view === 'alojz'
          ? snap.alojz
          : snap.joint
  const topbarDelta =
    view === 'all'
      ? snap.changeAbsolute
      : view === 'alma'
        ? snap.almaChangeAbsolute
        : view === 'alojz'
          ? snap.alojzChangeAbsolute
          : snap.jointChangeAbsolute
  const topbarPct =
    view === 'all'
      ? snap.changePct
      : view === 'alma'
        ? snap.almaChangePct
        : view === 'alojz'
          ? snap.alojzChangePct
          : snap.jointChangePct

  const summaryRows = buildSummaryRows({
    totalAll: snap.total ?? 0,
    totalAlojz: snap.alojz ?? 0,
    totalAlma: snap.alma ?? 0,
    pctAll: snap.changePct,
    pctAlojz: snap.alojzChangePct,
    pctAlma: snap.almaChangePct,
  })

  // Chart line visibility — light up a per-holder/shared line whenever
  // that bucket has any non-excluded canonical accounts.
  function bucketHasVisible(predicate: (a: AccountSummary) => boolean) {
    return conns.some((c) =>
      c.accounts.some((a) => predicate(a) && !a.excludedFromTotal && !a.possibleDuplicateOf),
    )
  }
  const showAlojz = bucketHasVisible((a) => a.derivedHolder === 'alojz')
  const showAlma = bucketHasVisible((a) => a.derivedHolder === 'alma')
  const showShared = bucketHasVisible((a) => a.derivedHolder === 'joint')

  const sidebarConnections: ConnectionView[] = conns

  const topError =
    pageError ??
    connections.error?.message ??
    syncAll.error?.message ??
    disconnect.error?.message ??
    toggleExclude.error?.message ??
    null

  return (
    <>
      {/* Desktop: sidebar + main panel. Hidden below `lg` (1024px). */}
      <div className="hidden h-screen w-screen overflow-hidden lg:flex">
        <Sidebar
          connections={sidebarConnections}
          view={view}
          onChangeView={setView}
          showCombined={showCombined}
          onToggleCombined={() => setShowCombined((v) => !v)}
          onToggleAllForHolder={onToggleAllForHolder}
          onToggleAllShared={onToggleAllShared}
          onAddAccount={openAdd}
          initialWidth={initialSidebarWidth}
          onOpenAccountSettings={(account, connection) =>
            setActiveAccount({ account, connection })
          }
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            view={view}
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

            <Timeline
              period={period}
              showCombined={showCombined}
              showAlojz={showAlojz}
              showAlma={showAlma}
              showShared={showShared}
              onSnapshotChange={setSnap}
            />

            <SummaryCards rows={summaryRows} period={period} currency={snap.currency} />
          </div>
        </main>
      </div>

      {/* Mobile + tablet: stacked layout matching the Aloma mobile UI kit. */}
      <MobileLayout
        connections={sidebarConnections}
        view={view}
        onChangeView={setView}
        period={period}
        onPeriodChange={setPeriod}
        snap={snap}
        showCombined={showCombined}
        showAlojz={showAlojz}
        showAlma={showAlma}
        showShared={showShared}
        onAddAccount={openAdd}
        onOpenAccountSettings={(account, connection) =>
          setActiveAccount({ account, connection })
        }
        topError={topError}
        onDismissError={() => setPageError(null)}
      />

      <AddBankModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConnected={() => celebrate()}
        initialHolder={addHolder}
      />

      <AccountSettingsModal
        account={activeAccount?.account ?? null}
        connection={activeAccount?.connection ?? null}
        onClose={() => setActiveAccount(null)}
        onToggleHide={() => {
          if (!activeAccount) return
          onToggleAccount(activeAccount.account)
          setActiveAccount(null)
        }}
        onDisconnect={onDisconnectActive}
        toggling={toggleExclude.isPending}
        disconnecting={disconnect.isPending}
      />
    </>
  )
}

// Re-export so AccountTile / others that previously imported Holder from
// lib/queries don't have to learn another import path.
export type { Holder }
