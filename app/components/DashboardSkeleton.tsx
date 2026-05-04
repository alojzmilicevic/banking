import Image from 'next/image'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartShape, PeriodTabsShape } from './skeleton-shapes'

export function DashboardSkeleton({ sidebarWidth }: { sidebarWidth: number }) {
  return (
    <div className="hidden h-screen w-screen overflow-hidden lg:flex">
      <SidebarSkeleton width={sidebarWidth} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <TopbarSkeleton />

        <div className="flex flex-1 flex-col gap-5 overflow-hidden px-7 py-6">
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
      style={{ '--sb-width': `${width}px` } as React.CSSProperties}
      className="relative flex w-(--sb-width) shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-card px-4 py-5"
    >
      {/* Logo — static UI chrome, render as-is */}
      <div className="mb-7 flex items-center gap-2.5 border-b border-border-subtle pb-5">
        <Image src="/logo-icon.svg" alt="Aloma" width={30} height={30} priority />
        <span className="font-display text-20 tracking-display">aloma</span>
      </div>

      {/* "View" label — static text, mirrors Sidebar.tsx */}
      <div className="mb-2 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
        View
      </div>

      {/* View switcher rows — All + 1 holder + Shared mirrors the
          single-user default (the app's documented common case). Wrap
          each in the same border+padding container as the real button so
          total row height matches and there's no jump on data arrival. */}
      <div className="mb-1 flex flex-col gap-0.75">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex w-full items-center gap-2.5 rounded-9 border border-transparent px-3 py-2.25 text-14"
          >
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
            {i > 0 && <Skeleton className="ml-auto h-3 w-11" />}
          </div>
        ))}
      </div>

      <div className="my-4 h-px bg-border-subtle" />

      {/* "Accounts" label — static text */}
      <div className="mb-2.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
        Accounts
      </div>

      {/* 1 PersonSection + Shared mirrors the single-user default (per
          MEMORY/CLAUDE.md: this app is a single-user wealth aggregator).
          Hidden-toggle is data-dependent so we don't reserve space for
          it — most users have no hidden accounts. */}
      <PersonSectionSkeleton accountRows={3} withAdd />
      <PersonSectionSkeleton accountRows={2} sharedHeader />

      {/* "Combined line" toggle — always rendered by Sidebar, so reserve
          the row to avoid a downward jump when data lands. Static label,
          shimmer for the On/Off pill. */}
      <div className="mt-1 flex w-full items-center gap-2.5 rounded-9 border border-border-subtle px-3 py-2.25 text-14 text-text-faint">
        <span className="h-0.5 w-4 shrink-0 rounded-1 bg-primary" />
        Combined line
        <Skeleton className="ml-auto h-2.75 w-5" />
      </div>

      {/* Mirrors Sidebar.tsx — fills remaining vertical space so scroll
          behaviour matches the loaded layout. */}
      <div className="flex-1" />
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
    <div className="mb-3 rounded-14 border border-border-subtle bg-white/2 px-4.5 py-4">
      {/* Header — matches PersonSection: mb-3.5 gap-2.5 */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <Skeleton className="size-8.5 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.75 w-22" />
          <Skeleton className="mt-1 h-2.75 w-17" />
        </div>
        <div className="text-right">
          <Skeleton className="ml-auto h-4 w-15" />
          <Skeleton className="mt-1 ml-auto h-2.75 w-10.5" />
        </div>
        {/* Hide button: real is px-2 py-1.25 text-11 ≈ 24px tall.
            Shared section has no Hide button per SharedSection.tsx, so omit. */}
        {!sharedHeader && <Skeleton className="ml-1 h-6 w-10.5 rounded-7" />}
      </div>

      {/* Account rows — replicate SidebarAccountRow shell exactly */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: accountRows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-10 border border-border-subtle bg-white/3 px-3.5 py-2.5"
          >
            <Skeleton className="size-6.5 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-7/10" />
            </div>
            <div className="ml-1.5 text-right">
              <Skeleton className="ml-auto h-3.5 w-16" />
              <Skeleton className="mt-1 ml-auto h-2.75 w-10" />
            </div>
          </div>
        ))}
      </div>

      {/* "Hidden (N)" toggle — real is px-2.5 py-1.5 text-11 ≈ 26px */}
      {withHidden && (
        <div className="mt-2 flex items-center gap-1.5 rounded-8 px-2.5 py-1.5">
          <Skeleton className="size-3.5 rounded-3" />
          <Skeleton className="h-2.75 w-16" />
        </div>
      )}

      {/* Add account — render as the actual dashed button shell to lock layout */}
      {withAdd && (
        <div className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-10 border border-dashed border-white/12 px-3.5 py-2.25 text-14">
          <Skeleton className="size-3.5 rounded-3" />
          <Skeleton className="h-3.25 w-20" />
        </div>
      )}
    </div>
  )
}

function TopbarSkeleton() {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-background px-7 py-4">
      <div>
        {/* Default view is "All Accounts" — render as static text */}
        <div className="mb-0.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          All Accounts
        </div>
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-8 w-50" />
          <Skeleton className="h-3.5 w-30" />
        </div>
      </div>

      <PeriodTabsShape />
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-16 border border-border-subtle bg-white/2 px-6 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          Growth · 1Y
        </span>
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="h-0.5 w-4.5" />
              <Skeleton className="h-3 w-15" />
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
    <div className="grid shrink-0 grid-cols-3 gap-3.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-14 border border-border-subtle bg-white/2 px-5 py-4">
          <Skeleton className="mb-2 h-2.75 w-18" />
          <Skeleton className="h-6 w-35" />
          <Skeleton className="mt-1.5 h-3 w-22" />
        </div>
      ))}
    </div>
  )
}
