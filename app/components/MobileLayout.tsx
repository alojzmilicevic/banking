// Phone-and-tablet layout, mirroring the Aloma mobile UI kit. Below `lg`
// the sidebar drops out: the view switcher (one chip per holder + Shared
// + All) becomes the top tab strip, the balance hero + chart + range
// pills stack vertically, and accounts move into a flat list below.
//
// Same data layer as the desktop layout — same `dashboard`, `view`,
// `period`, `snap` from HomeContent — so toggles in either layout stay
// coherent if the viewport is resized.

import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Plus, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { IconButton } from '@/components/ui/icon-button'
import { Money, Sensitive } from '@/components/sensitive-data'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import { cn } from '@/lib/utils'
import type { DashboardAccount, DashboardResponse } from '@/lib/api/dashboard'
import { ChangePill } from './ChangePill'
import { ChangeModeToggle, type ChangeMode } from './ChangeModeToggle'
import { MobileAccountRow } from './MobileAccountRow'
import { PeriodTabs, type Period } from './PeriodTabs'
import type { ViewSelection } from './Sidebar'
import { Timeline, type TimelineSnapshot } from './Timeline'

function bucketColor(a: DashboardAccount, holderColorById: Map<string, string>): string {
  switch (a.bucket.kind) {
    case 'holder':
      return holderColorById.get(a.bucket.holderId) ?? COMBINED_META.color
    case 'shared':
      return SHARED_META.color
    case 'unassigned':
      return COMBINED_META.color
  }
}

export function MobileLayout({
  dashboard,
  view,
  onChangeView,
  period,
  onPeriodChange,
  snap,
  showCombined,
  visibleHolderIds,
  showShared,
  onToggleCombined,
  onToggleHolder,
  onToggleShared,
  onToggleAccount,
  onSyncAll,
  syncingAll,
  topError,
  onDismissError,
  changeMode,
  onChangeModeChange,
}: {
  dashboard: DashboardResponse
  view: ViewSelection
  onChangeView: (v: ViewSelection) => void
  period: Period
  onPeriodChange: (p: Period) => void
  snap: TimelineSnapshot
  showCombined: boolean
  visibleHolderIds: string[]
  showShared: boolean
  onToggleCombined: () => void
  onToggleHolder: (holderId: string) => void
  onToggleShared: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onSyncAll: () => void
  syncingAll: boolean
  topError: string | null
  onDismissError: () => void
  changeMode: ChangeMode
  onChangeModeChange: (m: ChangeMode) => void
}) {
  // Tabs: All + each holder + Shared. Server already ordered holders by
  // displayOrder.
  const tabs: { key: ViewSelection; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: COMBINED_META.color },
    ...dashboard.holders.map((h) => ({ key: h.id, label: h.label, color: h.color })),
    { key: 'shared', label: SHARED_META.label, color: SHARED_META.color },
  ]
  const holderColorById = new Map(dashboard.holders.map((h) => [h.id, h.color]))

  // Account list + topbar values for the active tab. Total tracks the
  // chart's latest point (snap); change comes from the dashboard's
  // deposit-adjusted bucket math.
  const { visibleItems, total, change } = pickViewSlice()

  function pickViewSlice() {
    if (view === 'all') {
      return {
        visibleItems: [
          ...dashboard.holders.flatMap((h) => h.accounts),
          ...dashboard.shared.accounts.filter((a) => !a.possibleDuplicateOf),
        ],
        total: snap.total,
        change: dashboard.totals.change,
      }
    }
    if (view === 'shared') {
      return {
        visibleItems: dashboard.shared.accounts.filter((a) => !a.possibleDuplicateOf),
        total: snap.shared,
        change: dashboard.shared.change,
      }
    }
    const holder = dashboard.holders.find((h) => h.id === view)
    return {
      visibleItems: holder?.accounts ?? [],
      total: snap.byHolder[view] ?? null,
      change: holder?.change ?? null,
    }
  }
  const currency = snap.currency ?? dashboard.baseCurrency

  // Sub-totals row (only for the "All" view) — one chip per holder + Shared.
  const subTotals = [
    ...dashboard.holders.map((h) => ({ label: h.label, val: h.total, color: h.color })),
    { label: SHARED_META.label, val: dashboard.shared.total, color: SHARED_META.color },
  ]

  return (
    <div className="flex h-screen w-screen select-none flex-col overflow-hidden lg:hidden">
      {/* ── Top nav: logo + settings ───────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-18 tracking-display">aloma</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={onSyncAll}
            disabled={syncingAll}
            aria-label="Sync all banks"
            title="Sync all banks"
          >
            {syncingAll ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <RefreshCw className="size-4.5" />
            )}
          </IconButton>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/6 hover:text-foreground"
          >
            <SettingsIcon className="size-4.5" />
          </Link>
        </div>
      </div>

      {/* ── View tabs ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-border-subtle px-5">
        {tabs.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              style={{ '--tab-color': v.color } as React.CSSProperties}
              className={cn(
                '-mb-px flex-1 border-b-2 pb-2.5 pt-2 text-14 transition-all',
                active
                  ? 'border-(--tab-color) font-semibold text-(--tab-color)'
                  : 'border-transparent font-normal text-text-faint',
              )}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      {/* ── Scroll area ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {topError && (
          <div className="px-5 pt-3">
            <Alert onDismiss={onDismissError}>{topError}</Alert>
          </div>
        )}

        {/* ── Balance hero ────────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-4.5">
          <div className="mb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
            Total balance
          </div>
          <Sensitive className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-30 font-light leading-none tracking-hero text-foreground tabular-nums">
              <Money amount={total} currency={currency} />
            </span>
            <ChangePill change={change} variant="chip" />
          </Sensitive>
          {change && (
            <div className="mt-1.5 text-12 text-text-faint">
              {`Past ${period === 'ALL' ? 'all time' : period}`}
            </div>
          )}
        </div>

        {/* ── Range pills + value/% toggle ────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-3.5 pb-1.5">
          <PeriodTabs value={period} onChange={onPeriodChange} />
          <ChangeModeToggle value={changeMode} onChange={onChangeModeChange} />
        </div>

        {/* ── Graph (compact) ─────────────────────────────────────── */}
        <div className="flex h-50 shrink-0 px-3">
          <Timeline
            period={period}
            holders={dashboard.holders}
            showCombined={showCombined}
            visibleHolderIds={visibleHolderIds}
            showShared={showShared}
            onToggleCombined={onToggleCombined}
            onToggleHolder={onToggleHolder}
            onToggleShared={onToggleShared}
          />
        </div>

        {/* ── "All" sub-totals divider ────────────────────────────── */}
        {view === 'all' && (
          <div className="mt-3 flex shrink-0 border-y border-border-subtle">
            {subTotals.map((p, i) => (
              <div
                key={p.label}
                className={cn(
                  'flex-1 px-4 py-3',
                  i < subTotals.length - 1 && 'border-r border-border-subtle',
                )}
              >
                <div className="mb-0.75 flex items-center gap-1.5">
                  <span
                    style={{ '--dot': p.color } as React.CSSProperties}
                    className="size-1.5 rounded-full bg-(--dot)"
                    aria-hidden
                  />
                  <span className="text-11 font-medium uppercase tracking-4 text-text-faint">
                    {p.label}
                  </span>
                </div>
                <div className="font-mono text-14 font-light tracking-display tabular-nums">
                  <Sensitive>
                    <Money amount={p.val} compact />
                  </Sensitive>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Account list ────────────────────────────────────────── */}
        <div className="px-1 pb-3 pt-3.5">
          <div className="px-4 pb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
            Accounts
          </div>

          {visibleItems.length === 0 ? (
            <p className="px-5 py-3.5 text-14 text-text-faint">
              {dashboard.holders.every((h) => h.accounts.length === 0) &&
              dashboard.shared.accounts.length === 0
                ? 'No accounts linked yet — tap “Add account” to get started.'
                : 'No accounts in this view.'}
            </p>
          ) : (
            visibleItems.map((account) => (
              <MobileAccountRow
                key={account.id}
                account={account}
                connectionLabel={account.connection.label ?? account.connection.providerId}
                color={bucketColor(account, holderColorById)}
                onToggleVisibility={() => onToggleAccount(account)}
              />
            ))
          )}

          <div className="px-4 pt-2.5">
            <Link
              href="/settings/connectors"
              className="flex w-full items-center justify-center gap-2 rounded-12 border border-dashed border-white/12 px-4 py-3 text-14 text-text-faint transition-colors hover:border-input-border hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Manage connectors
            </Link>
          </div>
        </div>
      </div>

      {/* ── View dots ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border-subtle py-2.5">
        {tabs.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              aria-label={v.label}
              style={{ '--dot': v.color } as React.CSSProperties}
              className={cn(
                'h-1.5 rounded-full transition-all',
                active ? 'w-4 bg-(--dot)' : 'w-1.5 bg-white/15',
              )}
            />
          )
        })}
      </div>
    </div>
  )
}

