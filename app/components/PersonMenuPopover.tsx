'use client'

import { useMemo } from 'react'
import { Eye, EyeOff, Link2Off, Loader2, Plus, RefreshCw } from 'lucide-react'
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

function ConnectionRow({
  group,
  syncing,
  onSync,
  onDisconnect,
}: {
  group: ConnectionGroup
  syncing: boolean
  onSync: () => void
  onDisconnect: () => void
}) {
  const label = connectionLabel(group.connection)
  const connected = group.connection.status !== 'expired' && !group.connection.lastSyncError
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <BankIcon
        providerId={group.connection.providerId}
        label={group.connection.label}
        size="md"
        connected={connected}
      />
      <div className="min-w-0 flex-1 truncate text-13 font-medium text-foreground">{label}</div>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        title={`Sync ${label}`}
        aria-label={`Sync ${label}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {syncing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        title={`Disconnect ${label}`}
        aria-label={`Disconnect ${label}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-neg/10 hover:text-neg"
      >
        <Link2Off className="size-3.5" />
      </button>
    </div>
  )
}

function AddBankRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add bank"
      title="Add bank"
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-text-faint transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-dashed border-white/18">
        <Plus className="size-3.5" />
      </span>
      <span className="text-13 font-medium">Add bank</span>
    </button>
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
  onAddAccount,
  onToggleAll,
  onToggleAccount,
  onDisconnectConnection,
  onSyncConnection,
  syncingConnectionIds,
}: {
  triggerLabel: string
  accounts: DashboardAccount[]
  allHidden: boolean
  onAddAccount?: () => void
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onDisconnectConnection: (connectionId: string, label: string) => void
  onSyncConnection: (connectionId: string) => void
  syncingConnectionIds: ReadonlySet<string>
}) {
  const groups = useMemo(() => groupByConnection(accounts), [accounts])
  const hasAccounts = accounts.length > 0

  return (
    <MenuPopover triggerLabel={triggerLabel}>
      {({ close }) => (
        <>
          {/* Connection list — one row per linked bank with explicit Sync
              and Disconnect buttons. The "+" row at the end opens the
              AddBankModal scoped to the holder. */}
          <div className="flex flex-col border-b border-border-subtle p-1.5">
            {groups.map((g) => (
              <ConnectionRow
                key={g.connection.id}
                group={g}
                syncing={syncingConnectionIds.has(g.connection.id)}
                onSync={() => onSyncConnection(g.connection.id)}
                onDisconnect={() => {
                  close()
                  onDisconnectConnection(g.connection.id, connectionLabel(g.connection))
                }}
              />
            ))}
            {onAddAccount && (
              <AddBankRow
                onClick={() => {
                  close()
                  onAddAccount()
                }}
              />
            )}
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
