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
import { Eye, EyeOff, Plus, Settings as SettingsIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { fmtMoney, fmtMoneyCompact, shortProduct } from '@/lib/format'
import { Sensitive, SensitiveToggle } from '@/components/sensitive-data'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import { cn } from '@/lib/utils'
import type { DashboardAccount, DashboardResponse } from '@/lib/api/dashboard'
import { PeriodTabs, type Period } from './PeriodTabs'
import type { ViewSelection } from './Sidebar'
import { Timeline, type TimelineSnapshot } from './Timeline'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

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
  onAddAccount,
  onOpenAccountSettings,
  topError,
  onDismissError,
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
  onAddAccount: (holderId: string) => void
  onOpenAccountSettings: (account: DashboardAccount) => void
  topError: string | null
  onDismissError: () => void
}) {
  // Tabs: All + each holder + Shared. Server already ordered holders by
  // displayOrder.
  const tabs: { key: ViewSelection; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: COMBINED_META.color },
    ...dashboard.holders.map((h) => ({ key: h.id, label: h.label, color: h.color })),
    { key: 'shared', label: SHARED_META.label, color: SHARED_META.color },
  ]
  const holderColorById = new Map(dashboard.holders.map((h) => [h.id, h.color]))

  // Account list filtered by active tab.
  const visibleItems: DashboardAccount[] =
    view === 'all'
      ? [
          ...dashboard.holders.flatMap((h) => h.accounts),
          ...dashboard.shared.accounts.filter((a) => !a.possibleDuplicateOf),
        ]
      : view === 'shared'
        ? dashboard.shared.accounts.filter((a) => !a.possibleDuplicateOf)
        : (dashboard.holders.find((h) => h.id === view)?.accounts ?? [])

  // Topbar values: pick the slice that matches the current view.
  const total =
    view === 'all' ? snap.total : view === 'shared' ? snap.shared : (snap.byHolder[view] ?? null)
  const change = snap.changeByKey[view] ?? null
  const delta = change?.absolute ?? null
  const pct = change?.pct ?? null

  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  // Sub-totals row (only for the "All" view) — one chip per holder + Shared.
  const subTotals = [
    ...dashboard.holders.map((h) => ({ label: h.label, val: h.total, color: h.color })),
    { label: SHARED_META.label, val: dashboard.shared.total, color: SHARED_META.color },
  ]

  // "+ Add account" defaults to the active person's section if one is
  // selected; otherwise the first holder.
  const addHolderId =
    dashboard.holders.find((h) => h.id === view)?.id ?? dashboard.holders[0]?.id ?? ''

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden lg:hidden">
      {/* ── Top nav: logo + settings ───────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-18 tracking-display">aloma</span>
        </div>
        <div className="flex items-center gap-1">
          <SensitiveToggle />
          <button
            type="button"
            aria-label="Settings"
            className="flex size-8.5 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/6"
          >
            <SettingsIcon className="size-4.5" />
          </button>
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
            <Alert>
              <button
                type="button"
                className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
                onClick={onDismissError}
                aria-label="Dismiss"
              >
                ✕
              </button>
              {topError}
            </Alert>
          </div>
        )}

        {/* ── Balance hero ────────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-4.5">
          <div className="mb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
            Total balance
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-30 font-light leading-none tracking-hero text-foreground tabular-nums">
              <Sensitive>{total != null ? fmtMoney(total, snap.currency) : '—'}</Sensitive>
            </span>
            {showPct && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.75 text-14 font-semibold',
                  positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg',
                )}
              >
                <Sensitive>
                  {positive ? '+' : '−'}
                  {Math.abs(pct!).toFixed(2)}%
                </Sensitive>
              </span>
            )}
          </div>
          {delta != null && (
            <div
              className={cn(
                'mt-1.5 font-mono text-14 font-light tracking-tight tabular-nums',
                positive ? 'text-pos' : 'text-neg',
              )}
            >
              <Sensitive>
                {positive ? '+' : ''}
                {fmtMoney(delta, snap.currency)}
              </Sensitive>{' '}
              · {period === 'ALL' ? 'All' : period}
            </div>
          )}
        </div>

        {/* ── Range pills ─────────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-3.5 pb-1.5">
          <PeriodTabs value={period} onChange={onPeriodChange} />
        </div>

        {/* ── Graph (compact) ─────────────────────────────────────── */}
        <div className="flex h-50 shrink-0 px-3">
          <Timeline
            period={period}
            holders={dashboard.holders}
            showCombined={showCombined}
            visibleHolderIds={visibleHolderIds}
            showShared={showShared}
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
                  <Sensitive>{fmtMoneyCompact(p.val)}</Sensitive>
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
                onOpenSettings={() => onOpenAccountSettings(account)}
              />
            ))
          )}

          <div className="px-4 pt-2.5">
            <button
              type="button"
              onClick={() => addHolderId && onAddAccount(addHolderId)}
              disabled={!addHolderId}
              className="flex w-full items-center justify-center gap-2 rounded-12 border border-dashed border-white/12 px-4 py-3 text-14 text-text-faint transition-colors hover:border-input-border hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              Add account
            </button>
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

function MobileAccountRow({
  account,
  connectionLabel,
  color,
  onOpenSettings,
}: {
  account: DashboardAccount
  connectionLabel: string
  color: string
  onOpenSettings: () => void
}) {
  const visible = !account.excludedFromTotal
  const pct = account.change30d?.pct
  const positive = (account.change30d?.absolute ?? 0) >= 0
  const Icon = visible ? Eye : EyeOff

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenSettings}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenSettings()
        }
      }}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-border-subtle px-5 py-3.25 transition-opacity',
        !visible && 'opacity-40',
      )}
    >
      <div
        style={{ '--stripe': color } as React.CSSProperties}
        className={cn('h-8 w-0.75 shrink-0 rounded-2 bg-(--stripe)', !visible && 'opacity-40')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium leading-[1.2] text-foreground">
          <Link
            href={`/account/${account.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-foreground hover:underline"
          >
            {accountLabel(account)}
          </Link>
        </div>
        <div className="mt-0.5 truncate text-12 text-text-faint">
          {[shortProduct(account.accountType) ?? shortProduct(account.product), connectionLabel]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        <div className="font-mono text-14 font-normal tracking-tight text-foreground tabular-nums">
          <Sensitive>{fmtMoney(account.balance, account.balanceCurrency)}</Sensitive>
        </div>
        {pct != null && (
          <div
            className={cn(
              'mt-0.75 inline-block rounded-full px-1.75 py-px text-11 font-medium',
              positive ? 'bg-pos-bg text-pos' : 'bg-white/6 text-neg',
            )}
          >
            <Sensitive>
              {positive ? '+' : '−'}
              {Math.abs(pct).toFixed(1)}%
            </Sensitive>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpenSettings()
        }}
        aria-label={visible ? 'Hide account' : 'Show account'}
        className="flex size-7 shrink-0 items-center justify-center rounded-6 text-text-faint"
      >
        <Icon className="size-3.75" />
      </button>
    </div>
  )
}
