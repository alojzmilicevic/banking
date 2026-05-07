'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  useConnectAvanza,
  useSyncConnection,
  useSyncProgress,
  type SyncProgressUpdate,
} from '@/lib/queries'

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

export function AvanzaPanel({
  holderId,
  onDone,
}: {
  holderId: string
  onDone: () => void
}) {
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
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
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
  phase: Phase
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

  const subtitle =
    phase.kind === 'authenticating'
      ? 'Verifying password + TOTP code with Avanza'
      : phase.kind === 'syncing'
        ? syncStageLabel(progress)
        : phase.kind === 'sync-error'
          ? 'Sync failed — credentials are saved, retry below'
          : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-11">
      <div className="flex items-center gap-2">
        <PhaseDot label="Authenticate" state={authState} />
        <div className="h-px flex-1 bg-border-subtle" />
        <PhaseDot label="Load data" state={syncState} />
      </div>
      {subtitle && <div className="text-11 text-muted-foreground">{subtitle}</div>}
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
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      <span className={`uppercase tracking-6 ${textClass}`}>{label}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-11 font-medium uppercase tracking-6 text-text-faint">{label}</label>
      {children}
    </div>
  )
}
