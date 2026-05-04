import Image from 'next/image'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartShape, PeriodTabsShape } from './skeleton-shapes'

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
      className="relative flex shrink-0 flex-col overflow-y-auto border-r p-[20px_16px]"
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

      {/* View switcher rows — All + 1 holder + Shared mirrors the
          single-user default (the app's documented common case). Wrap
          each in the same border+padding container as the real button so
          total row height matches and there's no jump on data arrival. */}
      <div className="mb-1 flex flex-col gap-[3px]">
        {[0, 1, 2].map((i) => (
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

      {/* 1 PersonSection + Shared mirrors the single-user default (per
          MEMORY/CLAUDE.md: this app is a single-user wealth aggregator).
          Hidden-toggle is data-dependent so we don't reserve space for
          it — most users have no hidden accounts. */}
      <PersonSectionSkeleton accountRows={3} withAdd />
      <PersonSectionSkeleton accountRows={2} sharedHeader />

      {/* "Combined line" toggle — always rendered by Sidebar, so reserve
          the row to avoid a downward jump when data lands. Static label,
          shimmer for the On/Off pill. */}
      <div
        className="mt-1 flex w-full items-center gap-[10px] rounded-[9px] border px-[12px] py-[9px] text-[13px] text-text-faint"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <span
          className="h-[2px] w-[16px] shrink-0 rounded-[1px]"
          style={{ background: 'var(--color-primary)' }}
        />
        Combined line
        <Skeleton className="ml-auto h-[11px] w-[20px]" />
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

