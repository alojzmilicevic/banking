// Left rail of the dashboard. Logo, view switcher, person sections,
// shared section, combined-line toggle. The view switcher only re-labels
// and re-totals the topbar/summary — the chart is controlled by the
// per-account eye toggles inside each section.
//
// All bucketing/totals come straight from the dashboard API now —
// components iterate over `dashboard.holders[]` and `dashboard.shared`.

import Image from 'next/image'
import type { DashboardAccount, DashboardResponse } from '@/lib/api/dashboard'
import { cn } from '@/lib/utils'
import { useResizableSidebar } from '@/hooks/use-resizable-sidebar'
import { PersonSection } from './PersonSection'
import { SharedSection } from './SharedSection'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
  clampSidebarWidth,
} from './sidebar-width'
import { ViewSwitcherRows, buildViewOptions } from './ViewSwitcher'

// 'all' | <holderId> | 'shared'. Encoded as a string so the value can be
// passed through useState / event handlers without a discriminated union.
export type ViewSelection = string

export function Sidebar({
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
  const options = buildViewOptions(dashboard)

  const { width, isResizing, onPointerDown, setWidth } = useResizableSidebar({
    initialWidth,
    cookieName: SIDEBAR_WIDTH_COOKIE,
    clamp: clampSidebarWidth,
  })

  return (
    <aside
      style={{ '--sb-width': `${width}px` } as React.CSSProperties}
      className="relative flex w-(--sb-width) shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-card px-4 py-5"
    >
      {/* Logo */}
      <div className="mb-7 flex items-center gap-2.5 border-b border-border-subtle pb-5">
        <Image src="/logo-icon.svg" alt="Aloma" width={30} height={30} priority />
        <span className="font-display text-20 tracking-display">aloma</span>
      </div>

      {/* View switcher */}
      <div className="mb-2 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
        View
      </div>
      <div className="mb-1">
        <ViewSwitcherRows options={options} value={view} onChange={onChangeView} />
      </div>

      <div className="my-4 h-px bg-border-subtle" />

      {/* Accounts label */}
      <div className="mb-2.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
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
        className={cn(
          'mt-1 flex w-full items-center gap-2.5 rounded-9 border border-border-subtle bg-transparent px-3 py-2.25 text-14 transition-colors',
          showCombined ? 'text-primary' : 'text-text-faint',
        )}
      >
        <span className="h-0.5 w-4 shrink-0 rounded-1 bg-primary" />
        Combined line
        <span className="ml-auto text-11">{showCombined ? 'On' : 'Off'}</span>
      </button>

      <div className="flex-1" />

      {/* Resize handle — 4px hover/drag target on the right edge. The
          inner indicator brightens while hovered or dragging so the
          affordance is discoverable without being noisy at rest. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onPointerDown}
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
