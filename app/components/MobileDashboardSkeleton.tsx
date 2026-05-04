import Image from 'next/image'
import { Settings as SettingsIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartShape, PeriodTabsShape } from './skeleton-shapes'

export default function MobileDashboardSkeleton() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden lg:hidden">
      {/* Top nav — static logo + settings icon, mirrors MobileLayout */}
      <div className="flex shrink-0 items-center justify-between px-[20px] pt-[14px] pb-[10px]">
        <div className="flex items-center gap-[10px]">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-[18px] tracking-[-0.02em]">aloma</span>
        </div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-text-faint">
          <SettingsIcon className="h-[18px] w-[18px]" />
        </div>
      </div>

      {/* View tabs — labels are data-driven; show shimmer bars in same row */}
      <div
        className="flex shrink-0 border-b px-[20px]"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-1 items-center justify-center pb-[10px] pt-[8px]"
          >
            <Skeleton className="h-[14px] w-[48px]" />
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Balance hero — static label + shimmer numbers */}
        <div className="shrink-0 px-[20px] pt-[18px]">
          <div className="mb-[6px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
            Total balance
          </div>
          <Skeleton className="h-[34px] w-[220px]" />
          <Skeleton className="mt-[10px] h-[13px] w-[140px]" />
        </div>

        {/* Range pills — actual control shape, no shimmer */}
        <div className="shrink-0 px-[20px] pt-[14px] pb-[6px]">
          <PeriodTabsShape />
        </div>

        {/* Compact graph */}
        <div className="h-[200px] shrink-0 px-[12px]">
          <div
            className="flex h-full flex-col rounded-[16px] border p-[14px_16px]"
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderColor: 'var(--color-border-subtle)',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Growth · 1Y
              </span>
              <div className="flex gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-[6px]">
                    <Skeleton className="h-[2px] w-[14px]" />
                    <Skeleton className="h-[10px] w-[40px]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ChartShape />
            </div>
          </div>
        </div>

        {/* Sub-totals row — one cell per holder + Shared. Single-user
            default = 1 holder + Shared = 2 cells, matching MobileLayout's
            subTotals array on the "All" view. */}
        <div
          className="mt-[12px] flex shrink-0 border-y"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex-1 px-[16px] py-[12px]"
              style={{
                borderRight:
                  i < 1 ? '1px solid var(--color-border-subtle)' : 'none',
              }}
            >
              <div className="mb-[6px] flex items-center gap-[6px]">
                <Skeleton className="h-[6px] w-[6px] rounded-full" />
                <Skeleton className="h-[10px] w-[48px]" />
              </div>
              <Skeleton className="h-[15px] w-[60px]" />
            </div>
          ))}
        </div>

        {/* Account list — static "Accounts" header */}
        <div className="px-[4px] pb-[12px] pt-[14px]">
          <div className="px-[16px] pb-[6px] text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
            Accounts
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-[12px] border-b px-[20px] py-[13px]"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <Skeleton className="h-[32px] w-[3px] rounded-[2px]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-[15px] w-[60%]" />
                <Skeleton className="mt-[4px] h-[12px] w-[40%]" />
              </div>
              <div className="text-right">
                <Skeleton className="ml-auto h-[15px] w-[64px]" />
                <Skeleton className="mt-[4px] ml-auto h-[11px] w-[40px]" />
              </div>
              <Skeleton className="h-[20px] w-[20px] rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
