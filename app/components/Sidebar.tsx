// Left rail of the dashboard. Logo, person sections, shared section.
// The mobile layout has its own tab-strip view switcher; on desktop the
// topbar always shows the combined total.
//
// All bucketing/totals come straight from the dashboard API —
// components iterate over `dashboard.holders[]` and `dashboard.shared`.

import Image from 'next/image'
import Link from 'next/link'
import { Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import type { DashboardAccount, DashboardResponse } from '@/lib/api/dashboard'
import { PersonSection } from './PersonSection'
import { SharedSection } from './SharedSection'
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

export function Sidebar({
  dashboard,
  onToggleAllForHolder,
  onToggleAllShared,
  onToggleAccount,
  onSyncAll,
  syncingAll,
  initialWidth,
}: {
  dashboard: DashboardResponse
  onToggleAllForHolder: (holderId: string) => void
  onToggleAllShared: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onSyncAll: () => void
  syncingAll: boolean
  // Comes from the server via the cookie read in app/page.tsx, so the
  // SSR'd HTML already has the correct width on first paint.
  initialWidth: number
}) {
  // Width comes from the cookie on first render (via initialWidth). All
  // updates live in local state; on drag end we write the cookie so the
  // next SSR pickup has the latest value.
  const [width, setWidth] = useState<number>(initialWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthAtDragStart = useRef(width)
  const xAtDragStart = useRef(0)

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    widthAtDragStart.current = width
    xAtDragStart.current = e.clientX
    setIsResizing(true)
  }

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
      style={{ '--sb-width': `${width}px` } as React.CSSProperties}
      className="relative flex w-(--sb-width) shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-card px-4 pb-5"
    >
      {/* Sticky header — logo + Settings entry. Owns its own top padding
          (rather than the aside) so it sits flush to the very top of
          the sidebar; bg-card matches the aside so scrolled content
          doesn't bleed through. */}
      <div className="sticky top-0 z-10 -mx-4 mb-7 flex items-center gap-2.5 border-b border-border-subtle bg-card px-4 py-5">
        <Image src="/logo-icon.svg" alt="Aloma" width={30} height={30} priority />
        <span className="font-display text-20 tracking-display">aloma</span>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/6 hover:text-foreground"
        >
          <SettingsIcon className="size-4" />
        </Link>
      </div>

      {/* Accounts label + Sync All */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          Accounts
        </span>
        <IconButton
          variant="toolbar"
          size="sm"
          onClick={onSyncAll}
          disabled={syncingAll}
          aria-label="Sync all banks"
          title="Sync all banks"
        >
          {syncingAll ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </IconButton>
      </div>

      {dashboard.holders.map((h) => (
        <PersonSection
          key={h.id}
          holder={h}
          onToggleAll={() => onToggleAllForHolder(h.id)}
          onToggleAccount={onToggleAccount}
        />
      ))}

      <SharedSection
        accounts={dashboard.shared.accounts}
        onToggleAll={onToggleAllShared}
        onToggleAccount={onToggleAccount}
      />

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
        className="group/resize absolute inset-y-0 right-0 z-20 flex w-1.5 -translate-x-0.5 cursor-col-resize touch-none items-center justify-center"
      >
        <span
          className={`h-full w-0.5 transition-colors ${
            isResizing ? 'bg-primary' : 'bg-transparent group-hover/resize:bg-primary/40'
          }`}
          aria-hidden
        />
      </div>
    </aside>
  )
}
