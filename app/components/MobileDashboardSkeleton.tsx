import Image from 'next/image'
import { Settings as SettingsIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChartShape, PeriodTabsShape } from './skeleton-shapes'

export function MobileDashboardSkeleton() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden lg:hidden">
      {/* Top nav — static logo + settings icon, mirrors MobileLayout */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-icon.svg" alt="Aloma" width={26} height={26} priority />
          <span className="font-display text-18 tracking-display">aloma</span>
        </div>
        <div className="flex size-8.5 items-center justify-center rounded-full text-text-faint">
          <SettingsIcon className="size-4.5" />
        </div>
      </div>

      {/* View tabs — labels are data-driven; show shimmer bars in same row */}
      <div className="flex shrink-0 border-b border-border-subtle px-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-1 items-center justify-center pb-2.5 pt-2">
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Balance hero — static label + shimmer numbers */}
        <div className="shrink-0 px-5 pt-4.5">
          <div className="mb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
            Total balance
          </div>
          <Skeleton className="h-8.5 w-55" />
          <Skeleton className="mt-2.5 h-3.25 w-35" />
        </div>

        {/* Range pills — actual control shape, no shimmer */}
        <div className="shrink-0 px-5 pt-3.5 pb-1.5">
          <PeriodTabsShape />
        </div>

        {/* Compact graph */}
        <div className="h-50 shrink-0 px-3">
          <div className="flex h-full flex-col rounded-16 border border-border-subtle bg-white/2 px-4 py-3.5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-11 font-medium uppercase tracking-eyebrow text-text-faint">
                Growth · 1Y
              </span>
              <div className="flex gap-3">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Skeleton className="h-0.5 w-3.5" />
                    <Skeleton className="h-2.5 w-10" />
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
        <div className="mt-3 flex shrink-0 border-y border-border-subtle">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn('flex-1 px-4 py-3', i < 1 && 'border-r border-border-subtle')}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Skeleton className="size-1.5 rounded-full" />
                <Skeleton className="h-2.5 w-12" />
              </div>
              <Skeleton className="h-3.75 w-15" />
            </div>
          ))}
        </div>

        {/* Account list — static "Accounts" header */}
        <div className="px-1 pb-3 pt-3.5">
          <div className="px-4 pb-1.5 text-11 font-medium uppercase tracking-eyebrow text-text-faint">
            Accounts
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border-subtle px-5 py-3.25"
            >
              <Skeleton className="h-8 w-0.75 rounded-2" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.75 w-3/5" />
                <Skeleton className="mt-1 h-3 w-2/5" />
              </div>
              <div className="text-right">
                <Skeleton className="ml-auto h-3.75 w-16" />
                <Skeleton className="mt-1 ml-auto h-2.75 w-10" />
              </div>
              <Skeleton className="size-5 rounded-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
