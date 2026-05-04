'use client'
// Left rail of the dashboard. Logo, view switcher, person sections,
// shared section, combined-line toggle. The view switcher only re-labels
// and re-totals the topbar/summary — the chart is controlled by the
// per-account eye toggles inside each section.
//
// All bucketing/totals come straight from the dashboard API now —
// components iterate over `dashboard.holders[]` and `dashboard.shared`.

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardAccount, DashboardResponse } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/lib/sensitive-data'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import PersonSection from './PersonSection'
import SharedSection from './SharedSection'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
  clampSidebarWidth,
} from './sidebar-width'

// 'all' | <holderId> | 'shared'. Encoded as a string so the value can be
// passed through useState / event handlers without a discriminated union.
export type ViewSelection = string

// 1-year cookie. Lax keeps it client-readable for our own writes and
// also sent on top-level navigations (which is when SSR needs it).
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365

function persistWidth(w: number) {
  if (typeof document === 'undefined') return
  document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${w}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`
}

export default function Sidebar({
  dashboard,
  view,
  onChangeView,
  showCombined,
  onToggleCombined,
  onToggleAllForHolder,
  onToggleAllShared,
  onAddAccount,
  onOpenAccountSettings,
  initialWidth,
}: {
  dashboard: DashboardResponse
  view: ViewSelection
  onChangeView: (v: ViewSelection) => void
  showCombined: boolean
  onToggleCombined: () => void
  onToggleAllForHolder: (holderId: string) => void
  onToggleAllShared: () => void
  onAddAccount: (holderId: string) => void
  onOpenAccountSettings?: (a: DashboardAccount) => void
  // Comes from the server via the cookie read in app/page.tsx, so the
  // SSR'd HTML already has the correct width on first paint.
  initialWidth: number
}) {
  // Switcher rows: All + each holder + Shared. Server already computed
  // every total — we just render.
  const switcher: { key: ViewSelection; label: string; color: string; total: number }[] = [
    { key: 'all', label: COMBINED_META.label, color: COMBINED_META.color, total: dashboard.totals.total },
    ...dashboard.holders.map((h) => ({ key: h.id, label: h.label, color: h.color, total: h.total })),
    { key: 'shared', label: SHARED_META.label, color: SHARED_META.color, total: dashboard.shared.total },
  ]

  // Width comes from the cookie on first render (via initialWidth). All
  // updates live in local state; on drag end we write the cookie so the
  // next SSR pickup has the latest value.
  const [width, setWidth] = useState<number>(initialWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthAtDragStart = useRef(width)
  const xAtDragStart = useRef(0)

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      widthAtDragStart.current = width
      xAtDragStart.current = e.clientX
      setIsResizing(true)
    },
    [width],
  )

  // Window-level pointer listeners for the duration of a drag — beats
  // attaching to the handle because the cursor leaves it the moment you
  // start moving fast.
  useEffect(() => {
    if (!isResizing) return
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - xAtDragStart.current
      setWidth(clampSidebarWidth(widthAtDragStart.current + dx))
    }
    function onUp() {
      setIsResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // Lock body cursor + selection so the drag UX is consistent even
    // when the cursor wanders over text/buttons mid-drag.
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [isResizing])

  // Persist the cookie at most once when the drag ends — writing on every
  // pointermove would touch document.cookie at ~60Hz, which the browser
  // serializes through a slow path.
  useEffect(() => {
    if (isResizing) return
    persistWidth(width)
  }, [isResizing, width])

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-y-auto border-r p-[20px_16px]"
      style={{
        width,
        background: 'var(--color-card)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      {/* Logo */}
      <div
        className="mb-[28px] flex items-center gap-[10px] border-b pb-[20px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <Image src="/logo-icon.svg" alt="Aloma" width={30} height={30} priority />
        <span className="font-display text-[20px] tracking-[-0.02em]">aloma</span>
      </div>

      {/* View switcher */}
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        View
      </div>
      <div className="mb-1 flex flex-col gap-[3px]">
        {switcher.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChangeView(v.key)}
              className="flex w-full items-center gap-[10px] rounded-[9px] border px-[12px] py-[9px] text-left text-[14px] transition-all"
              style={{
                background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderColor: active ? 'var(--color-border)' : 'transparent',
                color: active ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                fontWeight: active ? 500 : 400,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: v.color }}
                aria-hidden
              />
              {v.label}
              {v.key !== 'all' && (
                <span className="ml-auto font-mono text-[12px] text-text-faint">
                  <Sensitive>{fmtMoneyCompact(v.total)}</Sensitive>
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="my-4 h-px" style={{ background: 'var(--color-border-subtle)' }} />

      {/* Accounts label */}
      <div className="mb-[10px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        Accounts
      </div>

      {dashboard.holders.map((h) => (
        <PersonSection
          key={h.id}
          holder={h}
          onToggleAll={() => onToggleAllForHolder(h.id)}
          onAddAccount={() => onAddAccount(h.id)}
          onOpenAccountSettings={onOpenAccountSettings}
        />
      ))}

      <SharedSection
        accounts={dashboard.shared.accounts}
        onToggleAll={onToggleAllShared}
        onOpenAccountSettings={onOpenAccountSettings}
      />

      {/* Combined toggle */}
      <button
        type="button"
        onClick={onToggleCombined}
        className="mt-1 flex w-full items-center gap-[10px] rounded-[9px] border px-[12px] py-[9px] text-[13px] transition-colors"
        style={{
          background: 'transparent',
          borderColor: 'var(--color-border-subtle)',
          color: showCombined ? 'var(--color-primary)' : 'var(--color-text-faint)',
        }}
      >
        <span
          className="h-[2px] w-[16px] shrink-0 rounded-[1px]"
          style={{ background: 'var(--color-primary)' }}
        />
        Combined line
        <span className="ml-auto text-[11px]">{showCombined ? 'On' : 'Off'}</span>
      </button>

      <div className="flex-1" />

      {/* Resize handle — 4px hover/drag target on the right edge. The
          inner indicator brightens while hovered or dragging so the
          affordance is discoverable without being noisy at rest. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onResizePointerDown}
        onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
        className="group/resize absolute inset-y-0 right-0 z-20 flex w-[6px] -translate-x-[2px] cursor-col-resize items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <span
          className={`h-full w-[2px] transition-colors ${
            isResizing ? 'bg-primary' : 'bg-transparent group-hover/resize:bg-primary/40'
          }`}
          aria-hidden
        />
      </div>
    </aside>
  )
}
