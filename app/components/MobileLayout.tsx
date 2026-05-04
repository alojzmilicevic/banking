'use client'
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
import { Sensitive, SensitiveToggle } from '@/lib/sensitive-data'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import type {
  DashboardAccount,
  DashboardResponse,
} from '@/lib/api/dashboard'
import PeriodTabs, { type Period } from './PeriodTabs'
import type { ViewSelection } from './Sidebar'
import Timeline, { type TimelineSnapshot } from './Timeline'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

function bucketColor(
  a: DashboardAccount,
  holderColorById: Map<string, string>,
): string {
  switch (a.bucket.kind) {
    case 'holder':
      return holderColorById.get(a.bucket.holderId) ?? COMBINED_META.color
    case 'shared':
      return SHARED_META.color
    case 'unassigned':
      return COMBINED_META.color
  }
}

export default function MobileLayout({
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
    view === 'all'
      ? snap.total
      : view === 'shared'
        ? snap.shared
        : snap.byHolder[view] ?? null
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
      <div className="flex shrink-0 items-center justify-between px-[20px] pt-[14px] pb-[10px]">
        <div className="flex items-center gap-[10px]">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-[18px] tracking-[-0.02em]">aloma</span>
        </div>
        <div className="flex items-center gap-1">
          <SensitiveToggle />
          <button
            type="button"
            aria-label="Settings"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-text-faint transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          >
            <SettingsIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* ── View tabs ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 border-b px-[20px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        {tabs.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              className="flex-1 border-b-2 pb-[10px] pt-[8px] text-[14px] transition-all"
              style={{
                color: active ? v.color : 'var(--color-text-faint)',
                borderColor: active ? v.color : 'transparent',
                fontWeight: active ? 600 : 400,
                marginBottom: -1,
              }}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      {/* ── Scroll area ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {topError && (
          <div className="px-[20px] pt-[12px]">
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
        <div className="shrink-0 px-[20px] pt-[18px]">
          <div className="mb-[6px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
            Total balance
          </div>
          <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px]">
            <span
              className="font-mono text-[34px] font-light text-foreground tabular-nums"
              style={{ letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              <Sensitive>{total != null ? fmtMoney(total, snap.currency) : '—'}</Sensitive>
            </span>
            {showPct && (
              <span
                className="rounded-full px-[10px] py-[3px] text-[13px] font-semibold"
                style={{
                  background: positive ? 'var(--color-pos-bg)' : 'rgba(255,255,255,0.06)',
                  color: positive ? 'var(--color-pos)' : 'var(--color-neg)',
                }}
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
              className="mt-[6px] font-mono text-[13px] font-light tabular-nums"
              style={{
                letterSpacing: '-0.01em',
                color: positive ? 'var(--color-pos)' : 'var(--color-neg)',
              }}
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
        <div className="shrink-0 px-[20px] pt-[14px] pb-[6px]">
          <PeriodTabs value={period} onChange={onPeriodChange} />
        </div>

        {/* ── Graph (compact) ─────────────────────────────────────── */}
        <div className="flex h-[200px] shrink-0 px-[12px]">
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
          <div
            className="mt-[12px] flex shrink-0 border-y"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            {subTotals.map((p, i) => (
              <div
                key={p.label}
                className="flex-1 px-[16px] py-[12px]"
                style={{
                  borderRight:
                    i < subTotals.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                }}
              >
                <div className="mb-[3px] flex items-center gap-[6px]">
                  <span
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  <span className="text-[10px] font-medium uppercase tracking-[0.04em] text-text-faint">
                    {p.label}
                  </span>
                </div>
                <div
                  className="font-mono text-[15px] font-light tabular-nums"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  <Sensitive>{fmtMoneyCompact(p.val)}</Sensitive>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Account list ────────────────────────────────────────── */}
        <div className="px-[4px] pb-[12px] pt-[14px]">
          <div className="px-[16px] pb-[6px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
            Accounts
          </div>

          {visibleItems.length === 0 ? (
            <p className="px-[20px] py-[14px] text-[13px] text-text-faint">
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

          <div className="px-[16px] pt-[10px]">
            <button
              type="button"
              onClick={() => addHolderId && onAddAccount(addHolderId)}
              disabled={!addHolderId}
              className="flex w-full items-center justify-center gap-[8px] rounded-[12px] border border-dashed px-[16px] py-[12px] text-[13px] text-text-faint transition-colors hover:border-input-border hover:text-foreground disabled:opacity-50"
              style={{ borderColor: 'rgba(255,255,255,0.12)' }}
            >
              <Plus className="h-[14px] w-[14px]" />
              Add account
            </button>
          </div>
        </div>
      </div>

      {/* ── View dots ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-center gap-[6px] border-t py-[10px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        {tabs.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              aria-label={v.label}
              className="rounded-full transition-all"
              style={{
                width: active ? 16 : 6,
                height: 6,
                background: active ? v.color : 'rgba(255,255,255,0.15)',
              }}
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
      className="flex items-center gap-[12px] border-b px-[20px] py-[13px] transition-opacity"
      style={{
        borderColor: 'var(--color-border-subtle)',
        opacity: visible ? 1 : 0.4,
        cursor: 'pointer',
      }}
    >
      <div
        className="shrink-0 rounded-[2px]"
        style={{ width: 3, height: 32, background: color, opacity: visible ? 1 : 0.4 }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-[1.2] text-foreground">
          <Link
            href={`/account/${account.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-foreground hover:underline"
          >
            {accountLabel(account)}
          </Link>
        </div>
        <div className="mt-[2px] truncate text-[12px] text-text-faint">
          {[shortProduct(account.accountType) ?? shortProduct(account.product), connectionLabel]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-right">
        <div
          className="font-mono text-[15px] font-normal text-foreground tabular-nums"
          style={{ letterSpacing: '-0.01em' }}
        >
          <Sensitive>{fmtMoney(account.balance, account.balanceCurrency)}</Sensitive>
        </div>
        {pct != null && (
          <div
            className="mt-[3px] inline-block rounded-full px-[7px] py-[1px] text-[11px] font-medium"
            style={{
              background: positive ? 'var(--color-pos-bg)' : 'rgba(255,255,255,0.06)',
              color: positive ? 'var(--color-pos)' : 'var(--color-neg)',
            }}
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
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] text-text-faint"
      >
        <Icon className="h-[15px] w-[15px]" />
      </button>
    </div>
  )
}
