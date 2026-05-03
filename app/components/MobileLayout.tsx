'use client'
// Phone-and-tablet layout for the dashboard, mirroring the Aloma mobile UI
// kit. Below `lg` we drop the sidebar entirely: the view switcher (Me /
// Alma / Shared / All) becomes the top tab strip, the balance hero +
// chart + range pills stack vertically, and accounts move into a flat
// list below the chart.
//
// The data layer is shared with the desktop layout — same `view`,
// `period`, `snap` and `connections` from HomeContent — so toggles in
// either layout stay coherent if the viewport is resized.

import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Plus, Settings as SettingsIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { fmtMoney, fmtMoneyCompact, shortProduct } from '@/lib/format'
import {
  COMBINED_META,
  HOLDER_LABEL,
  HOUSEHOLD,
  SHARED_META,
  type LinkerHolder,
} from '@/lib/holders'
import type { AccountSummary, ConnectionView } from '@/lib/queries'
import PeriodTabs, { type Period } from './PeriodTabs'
import type { ViewSelection } from './Sidebar'
import Timeline, { type TimelineSnapshot } from './Timeline'

type AccountWithConn = { account: AccountSummary; conn: ConnectionView }

// Labels are kept terse so all four tabs fit on a phone — "All Accounts"
// is ~80px on its own and would push "Shared" off a 360-390px viewport.
const VIEW_TABS: { key: ViewSelection; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: COMBINED_META.color },
  { key: 'alojz', label: HOLDER_LABEL.alojz.label, color: HOLDER_LABEL.alojz.color },
  { key: 'alma', label: HOLDER_LABEL.alma.label, color: HOLDER_LABEL.alma.color },
  { key: 'shared', label: SHARED_META.label, color: SHARED_META.color },
]

function bucketAccounts(connections: ConnectionView[]) {
  const byBucket: Record<LinkerHolder | 'shared', AccountWithConn[]> = {
    alma: [],
    alojz: [],
    shared: [],
  }
  for (const c of connections) {
    for (const a of c.accounts) {
      if (a.possibleDuplicateOf) continue
      const dh = a.derivedHolder
      if (dh === 'joint') byBucket.shared.push({ account: a, conn: c })
      else if (dh === 'alma') byBucket.alma.push({ account: a, conn: c })
      else if (dh === 'alojz') byBucket.alojz.push({ account: a, conn: c })
      else if (c.holder === 'alma' || c.holder === 'alojz') {
        byBucket[c.holder].push({ account: a, conn: c })
      }
    }
  }
  return byBucket
}

function accountLabel(a: AccountSummary): string {
  return a.details || a.product || a.name || a.iban || a.id
}

function holderColor(a: AccountSummary, conn: ConnectionView): string {
  const dh = a.derivedHolder
  if (dh === 'joint') return SHARED_META.color
  if (dh === 'alma' || dh === 'alojz') return HOLDER_LABEL[dh].color
  if (conn.holder === 'alma' || conn.holder === 'alojz') {
    return HOLDER_LABEL[conn.holder].color
  }
  return COMBINED_META.color
}

export default function MobileLayout({
  connections,
  view,
  onChangeView,
  period,
  onPeriodChange,
  snap,
  showCombined,
  showAlojz,
  showAlma,
  showShared,
  onAddAccount,
  onOpenAccountSettings,
  topError,
  onDismissError,
}: {
  connections: ConnectionView[]
  view: ViewSelection
  onChangeView: (v: ViewSelection) => void
  period: Period
  onPeriodChange: (p: Period) => void
  snap: TimelineSnapshot
  showCombined: boolean
  showAlojz: boolean
  showAlma: boolean
  showShared: boolean
  onAddAccount: (h: LinkerHolder) => void
  onOpenAccountSettings: (account: AccountSummary, connection: ConnectionView) => void
  topError: string | null
  onDismissError: () => void
}) {
  const byBucket = bucketAccounts(connections)

  // Filter accounts by the active view tab.
  let visibleItems: AccountWithConn[]
  if (view === 'all') {
    visibleItems = [...byBucket.alojz, ...byBucket.alma, ...byBucket.shared]
  } else if (view === 'alojz') {
    visibleItems = byBucket.alojz
  } else if (view === 'alma') {
    visibleItems = byBucket.alma
  } else {
    visibleItems = byBucket.shared
  }

  // Topbar values: pick the slice that matches the current view.
  const total =
    view === 'all'
      ? snap.total
      : view === 'alma'
        ? snap.alma
        : view === 'alojz'
          ? snap.alojz
          : snap.joint
  const delta =
    view === 'all'
      ? snap.changeAbsolute
      : view === 'alma'
        ? snap.almaChangeAbsolute
        : view === 'alojz'
          ? snap.alojzChangeAbsolute
          : snap.jointChangeAbsolute
  const pct =
    view === 'all'
      ? snap.changePct
      : view === 'alma'
        ? snap.almaChangePct
        : view === 'alojz'
          ? snap.alojzChangePct
          : snap.jointChangePct

  const positive = (delta ?? 0) >= 0
  const showPct = pct != null && Number.isFinite(pct) && Math.abs(pct) <= 500

  // For the "All" view divider showing per-person sub-totals.
  const subTotals = [
    {
      label: HOLDER_LABEL.alojz.label,
      val: byBucket.alojz
        .filter(({ account }) => !account.excludedFromTotal)
        .reduce((s, { account }) => s + (account.balance ?? 0), 0),
      color: HOLDER_LABEL.alojz.color,
    },
    {
      label: HOLDER_LABEL.alma.label,
      val: byBucket.alma
        .filter(({ account }) => !account.excludedFromTotal)
        .reduce((s, { account }) => s + (account.balance ?? 0), 0),
      color: HOLDER_LABEL.alma.color,
    },
    {
      label: SHARED_META.label,
      val: byBucket.shared
        .filter(({ account }) => !account.excludedFromTotal)
        .reduce((s, { account }) => s + (account.balance ?? 0), 0),
      color: SHARED_META.color,
    },
  ]

  // "+ Add account" lands on the active person's section when one is
  // selected; for All / Shared we default to alojz (user) since the
  // AddBankModal needs a target holder.
  const addHolder: LinkerHolder = view === 'alma' ? 'alma' : 'alojz'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden lg:hidden">
      {/* ── Top nav: logo + settings ───────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between px-[20px] pt-[14px] pb-[10px]">
        <div className="flex items-center gap-[10px]">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-[18px] tracking-[-0.02em]">aloma</span>
        </div>
        <button
          type="button"
          aria-label="Settings"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-text-faint transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        >
          <SettingsIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* ── View tabs ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 border-b px-[20px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        {VIEW_TABS.map((v) => {
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
              {total != null ? fmtMoney(total, snap.currency) : '—'}
            </span>
            {showPct && (
              <span
                className="rounded-full px-[10px] py-[3px] text-[13px] font-semibold"
                style={{
                  background: positive ? 'var(--color-pos-bg)' : 'rgba(255,255,255,0.06)',
                  color: positive ? 'var(--color-pos)' : 'var(--color-neg)',
                }}
              >
                {positive ? '+' : '−'}
                {Math.abs(pct!).toFixed(2)}%
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
              {positive ? '+' : ''}
              {fmtMoney(delta, snap.currency)} · {period === 'ALL' ? 'All' : period}
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
            showCombined={showCombined}
            showAlojz={showAlojz}
            showAlma={showAlma}
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
                  {fmtMoneyCompact(p.val)}
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
              {connections.length === 0
                ? 'No accounts linked yet — tap “Add account” to get started.'
                : 'No accounts in this view.'}
            </p>
          ) : (
            visibleItems.map(({ account, conn }) => (
              <MobileAccountRow
                key={account.id}
                account={account}
                connectionLabel={conn.label ?? conn.providerId}
                color={holderColor(account, conn)}
                onOpenSettings={() => onOpenAccountSettings(account, conn)}
              />
            ))
          )}

          <div className="px-[16px] pt-[10px]">
            <button
              type="button"
              onClick={() => onAddAccount(addHolder)}
              className="flex w-full items-center justify-center gap-[8px] rounded-[12px] border border-dashed px-[16px] py-[12px] text-[13px] text-text-faint transition-colors hover:border-input-border hover:text-foreground"
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
        {VIEW_TABS.map((v) => {
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
  account: AccountSummary
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
      {/* Color bar */}
      <div
        className="shrink-0 rounded-[2px]"
        style={{ width: 3, height: 32, background: color, opacity: visible ? 1 : 0.4 }}
        aria-hidden
      />
      {/* Name + bank */}
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
      {/* Balance + delta */}
      <div className="shrink-0 whitespace-nowrap text-right">
        <div
          className="font-mono text-[15px] font-normal text-foreground tabular-nums"
          style={{ letterSpacing: '-0.01em' }}
        >
          {fmtMoney(account.balance, account.balanceCurrency)}
        </div>
        {pct != null && (
          <div
            className="mt-[3px] inline-block rounded-full px-[7px] py-[1px] text-[11px] font-medium"
            style={{
              background: positive ? 'var(--color-pos-bg)' : 'rgba(255,255,255,0.06)',
              color: positive ? 'var(--color-pos)' : 'var(--color-neg)',
            }}
          >
            {positive ? '+' : '−'}
            {Math.abs(pct).toFixed(1)}%
          </div>
        )}
      </div>
      {/* Eye indicator (decorative — actual toggle in the settings modal) */}
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
