'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { DashboardAccount, DashboardAccountConnection } from '@/lib/api/dashboard'
import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { MenuPopover } from '@/components/ui/menu-popover'
import { cn } from '@/lib/utils'
import { BankIcon } from './BankIcon'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

function connectionLabel(c: DashboardAccountConnection): string {
  return c.label ?? c.providerId
}

type ConnectionState = 'healthy' | 'expired' | 'errored'

function connectionState(c: DashboardAccountConnection): ConnectionState {
  if (c.status === 'expired') return 'expired'
  if (c.lastSyncError) return 'errored'
  return 'healthy'
}

function statusText(state: ConnectionState): string | null {
  if (state === 'expired') return 'Auth expired — manage in Settings'
  if (state === 'errored') return 'Last sync failed — manage in Settings'
  return null
}

interface ConnectionGroup {
  connection: DashboardAccountConnection
  accounts: DashboardAccount[]
}

function groupByConnection(accounts: DashboardAccount[]): ConnectionGroup[] {
  const map = new Map<string, ConnectionGroup>()
  for (const a of accounts) {
    const id = a.connection.id
    let group = map.get(id)
    if (!group) {
      group = { connection: a.connection, accounts: [] }
      map.set(id, group)
    }
    group.accounts.push(a)
  }
  return Array.from(map.values())
}

// Connection row is a navigation target — clicking anywhere takes the
// user to /settings/connectors where Sync / Reconnect / Disconnect live.
// Keeping action affordance off this surface (no fake-button icons)
// avoids the footgun of icons that look pressable but only navigate.
function ConnectionRow({ group, onClose }: { group: ConnectionGroup; onClose: () => void }) {
  const label = connectionLabel(group.connection)
  const state = connectionState(group.connection)
  const connected = state === 'healthy'
  const sub = statusText(state)
  return (
    <Link
      href="/settings/connectors"
      onClick={onClose}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
    >
      <BankIcon
        providerId={group.connection.providerId}
        label={group.connection.label}
        size="md"
        connected={connected}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-13 font-medium text-foreground">{label}</div>
        {sub && <div className="truncate text-11 text-neg">{sub}</div>}
      </div>
    </Link>
  )
}

function ToggleAllRow({ allHidden, onClick }: { allHidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {allHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {allHidden ? 'Show all in totals' : 'Hide all from totals'}
    </button>
  )
}

function AccountToggleRow({
  account,
  onClick,
}: {
  account: DashboardAccount
  onClick: () => void
}) {
  const visible = !account.excludedFromTotal
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.75 text-left transition-colors hover:bg-muted',
        !visible && 'opacity-60',
      )}
      title={visible ? 'Hide from totals' : 'Show in totals'}
    >
      <BankIcon
        providerId={account.connection.providerId}
        label={account.connection.label}
        size="sm"
        connected={visible}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {accountLabel(account)}
        </div>
      </div>
      <Sensitive className="shrink-0 whitespace-nowrap font-mono text-12 text-text-faint tabular-nums">
        {fmtMoney(account.balance, account.balanceCurrency)}
      </Sensitive>
      <span className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-text-faint transition-colors group-hover:text-foreground">
        {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </span>
    </button>
  )
}

export function PersonMenuPopover({
  triggerLabel,
  accounts,
  allHidden,
  onToggleAll,
  onToggleAccount,
}: {
  triggerLabel: string
  accounts: DashboardAccount[]
  allHidden: boolean
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
}) {
  const groups = useMemo(() => groupByConnection(accounts), [accounts])
  const hasAccounts = accounts.length > 0

  return (
    <MenuPopover triggerLabel={triggerLabel}>
      {({ close }) => (
        <>
          {/* Connection list — each row navigates to /settings/connectors,
              where the actual sync / reconnect / disconnect actions live. */}
          <div className="flex flex-col border-b border-border-subtle p-1.5">
            {groups.map((g) => (
              <ConnectionRow key={g.connection.id} group={g} onClose={close} />
            ))}
          </div>

          {hasAccounts && (
            <div className="border-b border-border-subtle p-2.5">
              <ToggleAllRow allHidden={allHidden} onClick={onToggleAll} />
            </div>
          )}

          {hasAccounts && (
            <div className="max-h-55 overflow-y-auto p-2">
              {accounts.map((a) => (
                <AccountToggleRow
                  key={a.id}
                  account={a}
                  onClick={() => onToggleAccount(a)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </MenuPopover>
  )
}
