'use client'
// Visual add-bank flow. Holder chips at the top come from the API now,
// so adding a household member doesn't require code changes here.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowRight,
  Building2,
  Check,
  Globe,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  useConnectAvanza,
  useDashboard,
  useHolders,
  useInstitutions,
  useStartEbAuth,
  useSyncConnection,
  useSyncProgress,
  type ASPSP,
  type HolderListItem,
  type SyncProgressUpdate,
} from '@/lib/queries'
import type { DashboardResponse } from '@/lib/api/dashboard'
import { holderTint } from '@/lib/holders'

type Provider = 'avanza' | 'eb'

type LinkedSlot = { avanza: boolean; eb: string[] }

function key(a: ASPSP) {
  return `${a.name}||${a.country}`
}

function buildLinkedByHolder(data: DashboardResponse | undefined) {
  const map = new Map<string, LinkedSlot>()
  if (!data) return map
  for (const h of data.holders) {
    const slot: LinkedSlot = { avanza: false, eb: [] }
    for (const a of h.accounts) {
      if (a.connection.providerId === 'avanza') slot.avanza = true
      else if (a.connection.providerId === 'enable-banking') {
        slot.eb.push(a.connection.label ?? 'a bank')
      }
    }
    map.set(h.id, slot)
  }
  return map
}

export default function AddBankModal({
  open,
  onClose,
  onConnected,
  initialHolderId,
}: {
  open: boolean
  onClose: () => void
  onConnected?: () => void
  initialHolderId?: string
}) {
  const holdersQ = useHolders()
  const holders = holdersQ.data ?? []
  const dashboard = useDashboard()

  const [holderId, setHolderId] = useState<string | undefined>(initialHolderId)
  const [provider, setProvider] = useState<Provider | null>(null)

  // Default to the first holder once the list loads (or to the prop if
  // the caller pre-picked one).
  useEffect(() => {
    if (initialHolderId) {
      setHolderId(initialHolderId)
      return
    }
    if (!holderId && holders.length > 0) setHolderId(holders[0].id)
  }, [initialHolderId, holderId, holders])

  // Re-sync when the modal re-opens with a different initialHolderId.
  useEffect(() => {
    if (open && initialHolderId) setHolderId(initialHolderId)
  }, [open, initialHolderId])

  // Per-holder map of which providers already have a connection. Used to
  // dim already-linked provider tiles and warn that picking them will
  // re-link (refresh credentials) rather than add a new bank.
  const linkedByHolder = buildLinkedByHolder(dashboard.data)

  const linkedHere = holderId ? linkedByHolder.get(holderId) : undefined
  const avanzaLinked = !!linkedHere?.avanza
  const ebLinked = (linkedHere?.eb.length ?? 0) > 0
  const ebLabels = (linkedHere?.eb ?? []).join(', ')

  return (
    <Modal
      open={open}
      onClose={() => {
        setProvider(null)
        onClose()
      }}
      className="max-w-xl"
      title={
        <div>
          <h2 className="text-base font-semibold">Link a bank</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Joint accounts get auto-detected when more than one holder links the same one.
          </p>
        </div>
      }
    >
      {/* Holder picker */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Linked by
          </p>
          {holderId && (
            <motion.p
              key={holderId}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-medium text-foreground"
            >
              {holders.find((h) => h.id === holderId)?.label}
            </motion.p>
          )}
        </div>
        {holders.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-card/40 px-3 py-2 text-xs text-muted-foreground">
            No household members yet — add one in settings.
          </p>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(holders.length, 3)}, minmax(0, 1fr))` }}
          >
            {holders.map((h) => (
              <HolderChip
                key={h.id}
                holder={h}
                active={holderId === h.id}
                onPick={() => setHolderId(h.id)}
                linkedSummary={summarize(linkedByHolder.get(h.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Provider grid */}
      {!provider && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Where from
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ProviderTile
              icon={<TrendingUp className="h-5 w-5" />}
              tone="bg-gradient-to-br from-emerald-500/15 to-transparent"
              title="Avanza"
              subtitle="Stocks, funds, ISK & pension"
              hint={avanzaLinked ? 'Re-link to update credentials' : 'via password + TOTP'}
              linked={avanzaLinked}
              disabled={!holderId}
              onClick={() => setProvider('avanza')}
            />
            <ProviderTile
              icon={<Building2 className="h-5 w-5" />}
              tone="bg-gradient-to-br from-blue-500/15 to-transparent"
              title="A bank"
              subtitle={ebLinked ? `${ebLabels} linked` : 'Handelsbanken, Swedbank, SEB…'}
              hint={ebLinked ? 'Add another or re-link' : 'via BankID (PSD2)'}
              linked={ebLinked}
              disabled={!holderId}
              onClick={() => setProvider('eb')}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {provider === 'avanza' && holderId && (
          <motion.div
            key="avanza-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <AvanzaPanel
              holderId={holderId}
              onDone={() => {
                onConnected?.()
                onClose()
                setProvider(null)
              }}
            />
          </motion.div>
        )}
        {provider === 'eb' && holderId && (
          <motion.div
            key="eb-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <BankPanel holderId={holderId} />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

function summarize(slot: { avanza: boolean; eb: string[] } | undefined): string | null {
  if (!slot) return null
  const count = (slot.avanza ? 1 : 0) + slot.eb.length
  if (count === 0) return null
  const parts: string[] = []
  if (slot.avanza) parts.push('Avanza')
  if (slot.eb.length > 0) parts.push(slot.eb.length === 1 ? '1 bank' : `${slot.eb.length} banks`)
  return parts.join(' + ')
}

function HolderChip({
  holder,
  active,
  onPick,
  linkedSummary,
}: {
  holder: HolderListItem
  active: boolean
  onPick: () => void
  linkedSummary: string | null
}) {
  const tint = holderTint(holder.color)
  const initials = holder.initials ?? holder.label.slice(0, 2).toUpperCase()
  return (
    <motion.button
      type="button"
      onClick={onPick}
      whileTap={{ scale: 0.97 }}
      aria-pressed={active}
      className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-primary bg-card shadow-md ring-2 ring-primary/20'
          : 'border-border bg-card/30 opacity-60 hover:border-input-border hover:opacity-100'
      }`}
    >
      {active && (
        <motion.div
          layoutId="holder-bg"
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(135deg, ${tint} 0%, transparent 100%)` }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-all"
        style={{
          background: `${holder.color}22`,
          color: holder.color,
          border: active ? `1.5px solid ${holder.color}55` : '1.5px solid transparent',
        }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold transition-colors ${
            active ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {holder.label}
        </p>
        <p
          className={`text-[0.7rem] transition-colors ${
            active ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {linkedSummary
            ? `${active ? 'Selected · ' : ''}${linkedSummary}`
            : active
              ? 'Selected · nothing linked'
              : 'Nothing linked'}
        </p>
      </div>
      {active && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  )
}

function ProviderTile({
  icon,
  tone,
  title,
  subtitle,
  hint,
  linked,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  tone: string
  title: string
  subtitle: string
  hint: string
  linked?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: linked || disabled ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
      className={`group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-card p-4 text-left transition-colors ${
        linked
          ? 'border-pos/30 opacity-70 hover:opacity-100'
          : 'border-border hover:border-input-border'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${tone} ${linked ? 'opacity-30' : 'opacity-70'}`}
        aria-hidden
      />
      {linked && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-pos-bg/80 px-1.5 py-0.5 text-[0.6rem] font-medium text-pos">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
          Linked
        </span>
      )}
      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/80 text-foreground">
        {icon}
      </div>
      <div className="relative">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[0.72rem] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative mt-auto flex items-center gap-1 text-[0.65rem] text-muted-foreground">
        {hint}
        <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-3 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ArrowRight className="h-3 w-3 rotate-180" />
      Pick a different provider
    </button>
  )
}

function AvanzaPanel({
  holderId,
  onDone,
}: {
  holderId: string
  onDone: () => void
}) {
  // The link flow has two visible phases on purpose: authentication
  // (the /usercredentials → /totp dance + Keychain save, ~1-2s) and
  // sync (categorizedAccounts + 12 months of chart data, ~5-30s).
  // Each gets a distinct label so the user isn't staring at a single
  // "Logging in…" spinner during what's mostly historical-data
  // backfill. Sync errors keep the connection alive — it's already
  // created — and the user can retry without re-typing creds.
  type Phase =
    | { kind: 'idle' }
    | { kind: 'authenticating' }
    | { kind: 'syncing'; connectionId: string }
    | { kind: 'auth-error'; message: string }
    | { kind: 'sync-error'; connectionId: string; message: string }

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpSeed, setTotpSeed] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const connect = useConnectAvanza()
  const sync = useSyncConnection()

  // Poll the server-side progress map only while we're actively
  // syncing, so the panel can show sub-progress like "Loading 12
  // months of history (3 of 5)..." without an SSE channel.
  const syncingId = phase.kind === 'syncing' ? phase.connectionId : null
  const progressQ = useSyncProgress(syncingId, phase.kind === 'syncing')
  const progress = progressQ.data

  const formMissing = !username.trim() || !password || !totpSeed.trim()
  const editable = phase.kind === 'idle' || phase.kind === 'auth-error'
  const busy = phase.kind === 'authenticating' || phase.kind === 'syncing'

  async function runSync(connectionId: string) {
    setPhase({ kind: 'syncing', connectionId })
    try {
      await sync.mutateAsync(connectionId)
      setUsername('')
      setPassword('')
      setTotpSeed('')
      setPhase({ kind: 'idle' })
      onDone()
    } catch (e) {
      setPhase({
        kind: 'sync-error',
        connectionId,
        message: (e as Error).message,
      })
    }
  }

  async function doConnect() {
    if (formMissing) {
      setPhase({ kind: 'auth-error', message: 'Username, password, and TOTP seed are all required' })
      return
    }
    setPhase({ kind: 'authenticating' })
    let connectionId: string
    try {
      const challenge = await connect.mutateAsync({
        username: username.trim(),
        password,
        totpSeed: totpSeed.trim(),
        holderId,
      })
      if (challenge.kind !== 'complete' || !challenge.connectionId) {
        throw new Error(challenge.message ?? `Unexpected challenge: ${challenge.kind}`)
      }
      connectionId = challenge.connectionId
    } catch (e) {
      setPhase({ kind: 'auth-error', message: (e as Error).message })
      return
    }
    await runSync(connectionId)
  }

  const buttonLabel = (() => {
    switch (phase.kind) {
      case 'authenticating':
        return 'Authenticating with Avanza…'
      case 'syncing':
        return syncStageLabel(progress)
      case 'sync-error':
        return 'Retry sync'
      default:
        return 'Connect Avanza'
    }
  })()

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        Stored in macOS Keychain. The TOTP seed is the base32 string under{' '}
        <em>Kopiera nyckeln</em> when you set up 2FA — same one your authenticator app holds.
        Syncs refresh themselves silently when the cookie session expires.
      </div>

      <PhaseIndicator phase={phase} progress={progress} />

      <Field label="Username">
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!editable}
          placeholder="alomi136"
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!editable}
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      <Field label="TOTP seed (base32)">
        <input
          type="password"
          autoComplete="off"
          value={totpSeed}
          onChange={(e) => setTotpSeed(e.target.value)}
          disabled={!editable}
          placeholder="MXF42B22ORYSEEONOZDCWEMOXVZ24AUQ"
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      {(phase.kind === 'auth-error' || phase.kind === 'sync-error') && (
        <Alert>
          {phase.kind === 'auth-error'
            ? phase.message
            : `Connected, but initial sync failed: ${phase.message}. Click Retry sync, or close — the connection will sync next time.`}
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => {
            if (phase.kind === 'sync-error') {
              void runSync(phase.connectionId)
              return
            }
            void doConnect()
          }}
          disabled={busy || (phase.kind !== 'sync-error' && formMissing)}
          className="flex-1"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {buttonLabel}
        </Button>
        {phase.kind === 'sync-error' && (
          <Button
            variant="secondary"
            onClick={() => {
              setPhase({ kind: 'idle' })
              setUsername('')
              setPassword('')
              setTotpSeed('')
              onDone()
            }}
          >
            Close
          </Button>
        )}
      </div>
    </div>
  )
}

// Maps server-side sync progress to a human-readable button/status
// label. Lives at module scope so it can be reused by the button and
// the indicator subtitle without a hook.
function syncStageLabel(p: SyncProgressUpdate | undefined): string {
  if (!p || p.stage === 'idle') return 'Loading…'
  switch (p.stage) {
    case 'reauth':
      return 'Re-authenticating…'
    case 'fetching-accounts':
      return 'Loading accounts…'
    case 'fetching-history':
      return p.total > 1
        ? `Loading 12 months of history (${p.completed} of ${p.total})…`
        : 'Loading 12 months of history…'
    case 'done':
      return 'Done'
    case 'error':
      return 'Sync error'
  }
}

// Two-step indicator with a sub-line that surfaces the live progress
// stage during sync. The dot states are: pending (muted), active
// (pulsing), done (green check), error (red).
function PhaseIndicator({
  phase,
  progress,
}: {
  phase:
    | { kind: 'idle' }
    | { kind: 'authenticating' }
    | { kind: 'syncing'; connectionId: string }
    | { kind: 'auth-error'; message: string }
    | { kind: 'sync-error'; connectionId: string; message: string }
  progress: SyncProgressUpdate | undefined
}) {
  if (phase.kind === 'idle' || phase.kind === 'auth-error') return null

  const authState =
    phase.kind === 'authenticating'
      ? 'active'
      : phase.kind === 'syncing' || phase.kind === 'sync-error'
        ? 'done'
        : 'pending'
  const syncState =
    phase.kind === 'syncing'
      ? 'active'
      : phase.kind === 'sync-error'
        ? 'error'
        : 'pending'

  // Subtitle shows the live sub-stage during sync, or a static line
  // during auth so the indicator never goes silent.
  const subtitle =
    phase.kind === 'authenticating'
      ? 'Verifying password + TOTP code with Avanza'
      : phase.kind === 'syncing'
        ? syncStageLabel(progress)
        : phase.kind === 'sync-error'
          ? 'Sync failed — credentials are saved, retry below'
          : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-[0.7rem]">
      <div className="flex items-center gap-2">
        <PhaseDot label="Authenticate" state={authState} />
        <div className="h-px flex-1 bg-border-subtle" />
        <PhaseDot label="Load data" state={syncState} />
      </div>
      {subtitle && (
        <div className="text-[0.7rem] text-muted-foreground">{subtitle}</div>
      )}
    </div>
  )
}

function PhaseDot({
  label,
  state,
}: {
  label: string
  state: 'pending' | 'active' | 'done' | 'error'
}) {
  const dotClass = {
    pending: 'bg-text-faint/30',
    active: 'bg-foreground animate-pulse',
    done: 'bg-pos',
    error: 'bg-neg',
  }[state]
  const textClass = {
    pending: 'text-text-faint',
    active: 'text-foreground font-medium',
    done: 'text-pos',
    error: 'text-neg font-medium',
  }[state]
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className={`uppercase tracking-[0.06em] ${textClass}`}>{label}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-faint">
        {label}
      </label>
      {children}
    </div>
  )
}

function BankPanel({ holderId }: { holderId: string }) {
  const [country, setCountry] = useState('SE')
  const [selected, setSelected] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const aspsps = useInstitutions(country)
  const startEb = useStartEbAuth()

  async function connect() {
    if (!selected) return
    const aspsp = aspsps.data?.find((a) => key(a) === selected)
    if (!aspsp) return setLocalError('Bank not found')
    setLocalError(null)
    try {
      const challenge = await startEb.mutateAsync({
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
        holderId,
      })
      if (challenge.kind === 'error') throw new Error(challenge.message)
      if (challenge.kind !== 'redirect' || !challenge.url) {
        throw new Error(`Unexpected challenge: ${challenge.kind}`)
      }
      window.location.href = challenge.url
    } catch (e) {
      setLocalError((e as Error).message)
    }
  }

  const error = localError ?? aspsps.error?.message ?? startEb.error?.message ?? null

  // Pin Sweden's most-common banks at the top as quick-pick tiles. They're
  // still in the dropdown too — the tiles are just there to skip 1-2 clicks
  // for the 95% case.
  const POPULAR_SE = ['Handelsbanken', 'Swedbank', 'SEB', 'Nordea']
  const popular =
    country === 'SE' && aspsps.data
      ? aspsps.data.filter((a) => POPULAR_SE.includes(a.name))
      : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={country} onChange={(e) => setCountry(e.target.value)} className="flex-1">
          <option value="SE">Sweden</option>
          <option value="NO">Norway</option>
          <option value="DK">Denmark</option>
          <option value="FI">Finland</option>
          <option value="DE">Germany</option>
          <option value="GB">UK</option>
        </Select>
      </div>

      {popular.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Popular
          </p>
          <div className="grid grid-cols-2 gap-2">
            {popular.map((a) => (
              <button
                key={key(a)}
                type="button"
                onClick={() => setSelected(key(a))}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected === key(a)
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-card hover:border-input-border'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          All banks
        </p>
        <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{aspsps.isLoading ? 'Loading banks…' : 'Search and select…'}</option>
          {aspsps.data?.map((a) => {
            const days = a.maximum_consent_validity
              ? Math.floor(a.maximum_consent_validity / 86400)
              : null
            return (
              <option key={key(a)} value={key(a)}>
                {a.name}
                {days ? ` — ${days}d max consent` : ''}
                {a.beta ? ' (beta)' : ''}
              </option>
            )
          })}
        </Select>
      </div>

      {error && <Alert>{error}</Alert>}

      <Button onClick={connect} disabled={!selected || startEb.isPending}>
        {startEb.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {startEb.isPending ? 'Redirecting…' : 'Continue to BankID'}
      </Button>
    </div>
  )
}
