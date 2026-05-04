import Image from 'next/image'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardSkeleton({ sidebarWidth }: { sidebarWidth: number }) {
  return (
    <div className="hidden h-screen w-screen overflow-hidden lg:flex">
      <SidebarSkeleton width={sidebarWidth} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <TopbarSkeleton />

        <div className="flex flex-1 flex-col gap-5 overflow-hidden p-[24px_28px]">
          <TimelineSkeleton />
          <SummaryCardsSkeleton />
        </div>
      </main>
    </div>
  )
}

function SidebarSkeleton({ width }: { width: number }) {
  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-r p-[20px_16px]"
      style={{
        width,
        background: 'var(--color-card)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      {/* Logo — static UI chrome, render as-is */}
      <div
        className="mb-[28px] flex items-center gap-[10px] border-b pb-[20px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <Image src="/logo-icon.svg" alt="Aloma" width={30} height={30} priority />
        <span className="font-display text-[20px] tracking-[-0.02em]">aloma</span>
      </div>

      {/* "View" label — static text, mirrors Sidebar.tsx */}
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        View
      </div>

      {/* View switcher rows — 3 generic rows. Wrap each in the same
          border+padding container as the real button so total row height
          matches and there's no jump on data arrival. */}
      <div className="mb-1 flex flex-col gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex w-full items-center gap-[10px] rounded-[9px] border border-transparent px-[12px] py-[9px] text-[14px]"
          >
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-[14px] w-[80px]" />
            {i > 0 && <Skeleton className="ml-auto h-[12px] w-[44px]" />}
          </div>
        ))}
      </div>

      <div className="my-4 h-px" style={{ background: 'var(--color-border-subtle)' }} />

      {/* "Accounts" label — static text */}
      <div className="mb-[10px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        Accounts
      </div>

      {/* Two PersonSections + Shared mirrors the typical loaded layout
          (≥1 holder + Shared bucket). Sized so the sidebar reaches the
          same overall height once data lands — no jump. */}
      <PersonSectionSkeleton accountRows={4} withHidden withAdd />
      <PersonSectionSkeleton accountRows={2} withAdd />
      <PersonSectionSkeleton accountRows={2} sharedHeader />
    </aside>
  )
}

function PersonSectionSkeleton({
  accountRows,
  withHidden = false,
  withAdd = false,
  sharedHeader = false,
}: {
  accountRows: number
  withHidden?: boolean
  withAdd?: boolean
  sharedHeader?: boolean
}) {
  return (
    <div
      className="mb-3 rounded-[14px] border p-[16px_18px]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      {/* Header — matches PersonSection: mb-[14px] gap-[10px] */}
      <div className="mb-[14px] flex items-center gap-[10px]">
        <Skeleton className="h-[34px] w-[34px] rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-[15px] w-[88px]" />
          <Skeleton className="mt-[4px] h-[11px] w-[68px]" />
        </div>
        <div className="text-right">
          <Skeleton className="ml-auto h-[16px] w-[60px]" />
          <Skeleton className="mt-[4px] ml-auto h-[11px] w-[42px]" />
        </div>
        {/* Hide button: real is px-[8px] py-[5px] text-[11px] ≈ 24px tall.
            Shared section has no Hide button per SharedSection.tsx, so omit. */}
        {!sharedHeader && (
          <Skeleton className="ml-1 h-[24px] w-[42px] rounded-[7px]" />
        )}
      </div>

      {/* Account rows — replicate SidebarAccountRow shell exactly */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: accountRows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-[10px] border px-[14px] py-[10px]"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderColor: 'var(--color-border-subtle)',
            }}
          >
            <Skeleton className="h-[26px] w-[26px] rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[14px] w-[70%]" />
            </div>
            <div className="ml-1.5 text-right">
              <Skeleton className="ml-auto h-[14px] w-[64px]" />
              <Skeleton className="mt-[4px] ml-auto h-[11px] w-[40px]" />
            </div>
          </div>
        ))}
      </div>

      {/* "Hidden (N)" toggle — real is px-[10px] py-[6px] text-[11px] ≈ 26px */}
      {withHidden && (
        <div className="mt-2 flex items-center gap-1.5 rounded-[8px] px-[10px] py-[6px]">
          <Skeleton className="h-[14px] w-[14px] rounded-[3px]" />
          <Skeleton className="h-[11px] w-[64px]" />
        </div>
      )}

      {/* Add account — render as the actual dashed button shell to lock layout */}
      {withAdd && (
        <div
          className="mt-[10px] flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed px-[14px] py-[9px] text-[13px]"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <Skeleton className="h-[14px] w-[14px] rounded-[3px]" />
          <Skeleton className="h-[13px] w-[80px]" />
        </div>
      )}
    </div>
  )
}

function TopbarSkeleton() {
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b px-[28px] py-[16px]"
      style={{
        background: 'var(--color-background)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      <div>
        {/* Default view is "All Accounts" — render as static text */}
        <div className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
          All Accounts
        </div>
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-[32px] w-[200px]" />
          <Skeleton className="h-[14px] w-[120px]" />
        </div>
      </div>

      <PeriodTabsShape />
    </div>
  )
}

// Static, non-interactive copy of PeriodTabs — same dimensions, no motion,
// no onClick. Used in skeleton states where we want the layout locked but
// no clickability.
function PeriodTabsShape() {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[9px] border border-border-subtle p-[3px]"
      style={{ background: 'var(--color-elevated)' }}
    >
      {['1W', '1M', '3M', '1Y', 'All'].map((label) => (
        <span
          key={label}
          className="rounded-[7px] px-[13px] py-[5px] text-xs font-medium text-text-faint"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-[16px] border p-[20px_24px]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
          Growth · 1Y
        </span>
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-[6px]">
              <Skeleton className="h-[2px] w-[18px]" />
              <Skeleton className="h-[12px] w-[60px]" />
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChartShape />
      </div>
    </div>
  )
}

function SummaryCardsSkeleton() {
  return (
    <div
      className="grid shrink-0 gap-[14px]"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[14px] border p-[16px_20px]"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'var(--color-border-subtle)',
          }}
        >
          <Skeleton className="mb-[8px] h-[11px] w-[72px]" />
          <Skeleton className="h-[24px] w-[140px]" />
          <Skeleton className="mt-[6px] h-[12px] w-[88px]" />
        </div>
      ))}
    </div>
  )
}

// Reusable chart-shape skeleton (legend-less). Used both by the full
// Dashboard skeleton and by Timeline's period-switch loading state.
export function ChartShape() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full animate-pulse"
        preserveAspectRatio="none"
        viewBox="0 0 400 200"
      >
        <defs>
          <linearGradient id="skeleton-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {[40, 80, 120, 160].map((y) => (
          <line
            key={y}
            x1="0"
            x2="400"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 4"
          />
        ))}
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,95 240,70 C280,50 320,80 360,40 L400,30 L400,200 L0,200 Z"
          fill="url(#skeleton-area)"
        />
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,95 240,70 C280,50 320,80 360,40 L400,30"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}

export { PeriodTabsShape }
