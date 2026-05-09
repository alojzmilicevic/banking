// Header row shared by PersonSection and SharedSection — avatar slot,
// label + accounts count, total + ChangePill, options popover.
//
// PersonSection passes initials text as the avatar; SharedSection passes
// a <Users /> icon. Everything else is identical.

import type { ReactNode } from 'react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import type { AccountPartition } from '@/lib/accounts'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { ChangePill, type ChangeValue } from './ChangePill'
import { HolderAvatar } from './HolderAvatar'
import { PersonMenuPopover } from './PersonMenuPopover'

export function HolderCardHeader({
  avatar,
  color,
  label,
  total,
  change,
  partition,
  triggerLabel,
  onToggleAll,
  onToggleAccount,
}: {
  avatar: ReactNode
  color: string
  label: string
  total: number
  change: ChangeValue | null
  partition: AccountPartition
  triggerLabel: string
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
}) {
  const { canonicals, visible, hidden, allHidden } = partition

  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <HolderAvatar color={color}>{avatar}</HolderAvatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium text-foreground">{label}</div>
        <div className="mt-px text-11 text-text-faint">
          {visible.length}
          {hidden.length > 0 ? ` of ${canonicals.length}` : ''}{' '}
          {canonicals.length === 1 ? 'account' : 'accounts'}
        </div>
      </div>
      <div className="flex shrink-0 flex-col whitespace-nowrap text-right">
        <Sensitive>
          <span className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            {fmtMoneyCompact(total)}
          </span>
        </Sensitive>
        <ChangePill change={change} variant="compact" className="mt-px" />
      </div>
      <PersonMenuPopover
        triggerLabel={triggerLabel}
        accounts={canonicals}
        allHidden={allHidden}
        onToggleAll={onToggleAll}
        onToggleAccount={onToggleAccount}
      />
    </div>
  )
}
