import type { DashboardResponse } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { COMBINED_META, SHARED_META } from '@/lib/holders'
import { cn } from '@/lib/utils'
import type { ViewSelection } from './Sidebar'

export interface ViewOption {
  key: ViewSelection
  label: string
  color: string
  total: number
}

// Builds the All + per-holder + Shared option list once so all three
// switcher variants render the same set in the same order.
export function buildViewOptions(dashboard: DashboardResponse): ViewOption[] {
  return [
    {
      key: 'all',
      label: COMBINED_META.label,
      color: COMBINED_META.color,
      total: dashboard.totals.total,
    },
    ...dashboard.holders.map((h) => ({
      key: h.id,
      label: h.label,
      color: h.color,
      total: h.total,
    })),
    {
      key: 'shared',
      label: SHARED_META.label,
      color: SHARED_META.color,
      total: dashboard.shared.total,
    },
  ]
}

interface BaseProps {
  options: ViewOption[]
  value: ViewSelection
  onChange: (v: ViewSelection) => void
}

// Desktop sidebar: vertical pill list with totals on the right.
export function ViewSwitcherRows({
  options,
  value,
  onChange,
  showTotals = true,
}: BaseProps & { showTotals?: boolean }) {
  return (
    <div className="flex flex-col gap-0.75">
      {options.map((v) => {
        const active = value === v.key
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(v.key)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-9 border px-3 py-2.25 text-left text-14 transition-all',
              active
                ? 'border-border bg-white/6 font-medium text-foreground'
                : 'border-transparent bg-transparent font-normal text-muted-foreground',
            )}
          >
            <span
              style={{ '--dot': v.color } as React.CSSProperties}
              className="size-2 shrink-0 rounded-full bg-(--dot)"
              aria-hidden
            />
            {v.label}
            {showTotals && v.key !== 'all' && (
              <span className="ml-auto font-mono text-12 text-text-faint">
                <Sensitive>{fmtMoneyCompact(v.total)}</Sensitive>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Mobile: horizontal tab strip under the topbar.
export function ViewSwitcherTabs({ options, value, onChange }: BaseProps) {
  return (
    <div className="flex border-b border-border-subtle px-5">
      {options.map((v) => {
        const active = value === v.key
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(v.key)}
            style={{ '--tab-color': v.color } as React.CSSProperties}
            className={cn(
              '-mb-px flex-1 border-b-2 pb-2.5 pt-2 text-14 transition-all',
              active
                ? 'border-(--tab-color) font-semibold text-(--tab-color)'
                : 'border-transparent font-normal text-text-faint',
            )}
          >
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

// Mobile: dot pager at the bottom.
export function ViewSwitcherDots({ options, value, onChange }: BaseProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2.5">
      {options.map((v) => {
        const active = value === v.key
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(v.key)}
            aria-label={v.label}
            style={{ '--dot': v.color } as React.CSSProperties}
            className={cn(
              'h-1.5 rounded-full transition-all',
              active ? 'w-4 bg-(--dot)' : 'w-1.5 bg-white/15',
            )}
          />
        )
      })}
    </div>
  )
}
