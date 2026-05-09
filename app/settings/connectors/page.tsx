'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Building2, Link2, Link2Off, Loader2, Plus, RefreshCw, TrendingUp } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { IconButton } from '@/components/ui/icon-button'
import {
  useDashboard,
  useDisconnect,
  useStartEbAuth,
  useSyncConnection,
} from '@/lib/queries'
import { cn } from '@/lib/utils'
import { AvanzaPanel } from '@/app/components/AvanzaPanel'
import { BankIcon } from '@/app/components/BankIcon'
import { EbBankPanel } from '@/app/components/EbBankPanel'
import { SettingsRow, SettingsSection } from '../SettingsSection'
import type {
  DashboardAccountConnection,
  DashboardHolder,
  DashboardResponse,
} from '@/lib/api/dashboard'

interface ConnectionGroup {
  connection: DashboardAccountConnection
  accountCount: number
}

interface HolderSlot {
  holder: DashboardHolder
  groups: ConnectionGroup[]
}

// Walk the dashboard's holder buckets + the joint shared bucket and
// emit one slot per holder, each carrying the deduped connections that
// holder owns. Connections shared with another holder still surface
// under whichever holder we encounter first; the AddConnector flow
// always scopes to a specific holder, so no orphaned rows.
function buildHolderSlots(data: DashboardResponse | undefined): HolderSlot[] {
  if (!data) return []
  return data.holders.map((h) => {
    const seen = new Map<string, ConnectionGroup>()
    for (const a of h.accounts) {
      if (a.possibleDuplicateOf) continue
      const existing = seen.get(a.connection.id)
      if (existing) {
        existing.accountCount += 1
      } else {
        seen.set(a.connection.id, { connection: a.connection, accountCount: 1 })
      }
    }
    return { holder: h, groups: Array.from(seen.values()) }
  })
}

type AddView =
  | { kind: 'closed' }
  | { kind: 'pick'; holderId: string }
  | { kind: 'avanza'; holderId: string }
  | { kind: 'eb'; holderId: string }

export default function ConnectorsPage() {
  const dashboard = useDashboard('1Y')
  const slots = useMemo(() => buildHolderSlots(dashboard.data), [dashboard.data])
  const [add, setAdd] = useState<AddView>({ kind: 'closed' })
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [ebError, setEbError] = useState<string | null>(null)
  const [reconnectingId, setReconnectingId] = useState<string | null>(null)

  const sync = useSyncConnection()
  const disconnect = useDisconnect()
  const ebAuth = useStartEbAuth()

  function onSync(connectionId: string) {
    setSyncingId(connectionId)
    sync.mutate(connectionId, { onSettled: () => setSyncingId(null) })
  }

  function onDisconnect(c: DashboardAccountConnection) {
    const label = c.label ?? c.providerId
    if (
      !confirm(
        `Disconnect ${label}?\n\nThis deletes its accounts, transactions and history. Snapshot history is recomputed on next sync.`,
      )
    )
      return
    disconnect.mutate(c.id)
  }

  async function onReconnect(c: DashboardAccountConnection, holderId: string) {
    if (c.providerId === 'avanza') {
      setAdd({ kind: 'avanza', holderId })
      return
    }
    if (c.providerId !== 'enable-banking') return
    if (!c.aspspName || !c.aspspCountry) {
      setEbError(
        `Can't auto-reconnect ${c.label ?? c.providerId} — missing institution info on this connection. Use Add connector to re-link manually.`,
      )
      return
    }
    setEbError(null)
    setReconnectingId(c.id)
    try {
      const challenge = await ebAuth.mutateAsync({
        aspspName: c.aspspName,
        aspspCountry: c.aspspCountry,
        holderId,
      })
      if (challenge.kind === 'redirect' && challenge.url) {
        window.location.href = challenge.url
        return
      }
      throw new Error(`Unexpected challenge: ${challenge.kind}`)
    } catch (e) {
      setEbError((e as Error).message)
      setReconnectingId(null)
    }
  }

  const error =
    ebError ??
    sync.error?.message ??
    disconnect.error?.message ??
    dashboard.error?.message ??
    null

  return (
    <>
      {error && <Alert>{error}</Alert>}

      {slots.map(({ holder, groups }) => (
        <SettingsSection key={holder.id} title={holder.label}>
          {groups.length === 0 && (
            <SettingsRow
              label="No banks linked"
              description="Use Add connector below to link Avanza or a PSD2 bank."
            />
          )}
          {groups.map((g) => (
            <ConnectorRow
              key={g.connection.id}
              connection={g.connection}
              accountCount={g.accountCount}
              syncing={syncingId === g.connection.id}
              reconnecting={reconnectingId === g.connection.id}
              onSync={() => onSync(g.connection.id)}
              onReconnect={() => onReconnect(g.connection, holder.id)}
              onDisconnect={() => onDisconnect(g.connection)}
            />
          ))}
          <div className="pt-3">
            {add.kind === 'pick' && add.holderId === holder.id && (
              <AddConnectorPicker
                onPick={(provider) => setAdd({ kind: provider, holderId: holder.id })}
                onCancel={() => setAdd({ kind: 'closed' })}
              />
            )}
            {add.kind === 'avanza' && add.holderId === holder.id && (
              <AddConnectorPanel onBack={() => setAdd({ kind: 'pick', holderId: holder.id })}>
                <AvanzaPanel
                  holderId={holder.id}
                  onDone={() => setAdd({ kind: 'closed' })}
                />
              </AddConnectorPanel>
            )}
            {add.kind === 'eb' && add.holderId === holder.id && (
              <AddConnectorPanel onBack={() => setAdd({ kind: 'pick', holderId: holder.id })}>
                <EbBankPanel holderId={holder.id} />
              </AddConnectorPanel>
            )}
            {(add.kind === 'closed' || add.holderId !== holder.id) && (
              <button
                type="button"
                onClick={() => setAdd({ kind: 'pick', holderId: holder.id })}
                className="flex w-full items-center justify-center gap-2 rounded-10 border border-dashed border-border-subtle py-3 text-13 text-text-faint transition-colors hover:border-input-border hover:text-foreground"
              >
                <Plus className="size-3.5" />
                Add connector for {holder.label}
              </button>
            )}
          </div>
        </SettingsSection>
      ))}

      {!dashboard.data && (
        <div className="text-12 text-text-faint">Loading connectors…</div>
      )}
    </>
  )
}

function ConnectorRow({
  connection,
  accountCount,
  syncing,
  reconnecting,
  onSync,
  onReconnect,
  onDisconnect,
}: {
  connection: DashboardAccountConnection
  accountCount: number
  syncing: boolean
  reconnecting: boolean
  onSync: () => void
  onReconnect: () => void
  onDisconnect: () => void
}) {
  const label = connection.label ?? connection.providerId
  const broken =
    connection.status === 'expired' || !!connection.lastSyncError
  const subline = buildSubline()

  function buildSubline() {
    if (broken && connection.status === 'expired') return 'Auth expired — reconnect to refresh'
    if (broken) return `Last sync failed: ${connection.lastSyncError ?? 'unknown error'}`
    const accountsLabel = `${accountCount} account${accountCount === 1 ? '' : 's'}`
    if (connection.lastSyncedAt) return `${accountsLabel} · synced ${fmtRelative(connection.lastSyncedAt)}`
    return `${accountsLabel} · never synced`
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <BankIcon
        providerId={connection.providerId}
        label={connection.label}
        size="lg"
        connected={!broken}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium text-foreground">{label}</div>
        <div className={cn('mt-0.5 truncate text-12', broken ? 'text-neg' : 'text-text-faint')}>
          {subline}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!broken && (
          <IconButton
            variant="menu"
            size="sm"
            onClick={onSync}
            disabled={syncing}
            title={`Sync ${label}`}
            aria-label={`Sync ${label}`}
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </IconButton>
        )}
        {broken && (
          <IconButton
            variant="menu"
            size="sm"
            onClick={onReconnect}
            disabled={reconnecting}
            title={`Reconnect ${label}`}
            aria-label={`Reconnect ${label}`}
          >
            {reconnecting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Link2 className="size-3.5" />
            )}
          </IconButton>
        )}
        <IconButton
          variant="menu-destructive"
          size="sm"
          onClick={onDisconnect}
          title={`${broken ? 'Remove' : 'Disconnect'} ${label}`}
          aria-label={`${broken ? 'Remove' : 'Disconnect'} ${label}`}
        >
          <Link2Off className="size-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

function AddConnectorPicker({
  onPick,
  onCancel,
}: {
  onPick: (provider: 'avanza' | 'eb') => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-12 border border-border-subtle bg-card/40 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-11 font-semibold uppercase tracking-eyebrow text-muted-foreground">
          Pick a provider
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-11 text-text-faint transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PickerTile
          icon={<TrendingUp className="size-5" />}
          title="Avanza"
          subtitle="Stocks, funds, ISK & pension"
          onClick={() => onPick('avanza')}
        />
        <PickerTile
          icon={<Building2 className="size-5" />}
          title="A bank"
          subtitle="Handelsbanken, Swedbank, SEB…"
          onClick={() => onPick('eb')}
        />
      </div>
    </div>
  )
}

function PickerTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-input-border"
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-secondary/80 text-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-11 text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  )
}

function AddConnectorPanel({
  children,
  onBack,
}: {
  children: React.ReactNode
  onBack: () => void
}) {
  return (
    <div className="rounded-12 border border-border-subtle bg-card/40 p-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-11 text-text-faint transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Pick a different provider
      </button>
      {children}
    </div>
  )
}

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}
