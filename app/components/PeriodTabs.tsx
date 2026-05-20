import { SegmentedControl, type SegmentedControlItem } from './SegmentedControl'

export const PERIODS = ['1W', '1M', '3M', '1Y', 'ALL'] as const
export type Period = (typeof PERIODS)[number]

const ITEMS: readonly SegmentedControlItem<Period>[] = [
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'All' },
]

export function PeriodTabs({
  value,
  onChange,
}: {
  value: Period
  onChange: (p: Period) => void
}) {
  return (
    <SegmentedControl
      items={ITEMS}
      value={value}
      onChange={onChange}
      ariaLabel="Time period"
    />
  )
}
