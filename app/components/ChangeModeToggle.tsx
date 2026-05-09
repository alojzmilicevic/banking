import { SegmentedControl, type SegmentedControlItem } from './SegmentedControl'

export type ChangeMode = 'abs' | 'pct'

const ITEMS: readonly SegmentedControlItem<ChangeMode>[] = [
  { id: 'abs', label: 'kr' },
  { id: 'pct', label: '%' },
]

export function ChangeModeToggle({
  value,
  onChange,
}: {
  value: ChangeMode
  onChange: (m: ChangeMode) => void
}) {
  return (
    <SegmentedControl
      items={ITEMS}
      value={value}
      onChange={onChange}
      ariaLabel="Change display mode"
    />
  )
}
