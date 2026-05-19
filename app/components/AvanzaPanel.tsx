'use client'

import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAvanzaConnectFlow,
  type AvanzaPhase,
} from '@/hooks/use-avanza-connect-flow'
import { syncStageLabel } from '@/hooks/use-sync-progress-label'
import type { SyncProgressUpdate } from '@/lib/queries'
import { cn } from '@/lib/utils'

export function AvanzaPanel({
  holderId,
  onDone,
}: {
  holderId: string
  onDone: () => void
}) {
  const flow = useAvanzaConnectFlow(holderId, onDone)
  const {
    username,
    password,
    totpSeed,
    setUsername,
    setPassword,
    setTotpSeed,
    phase,
    progress,
    buttonLabel,
    formMissing,
    editable,
    busy,
    submit,
    closeAfterSyncError,
  } = flow

  const errorMessage = errorMessageFor(phase)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        Stored encrypted in the app database. The TOTP seed is the base32 string under{' '}
        <em>Kopiera nyckeln</em> when you set up 2FA — same one your authenticator app holds.
        Syncs refresh themselves silently when the cookie session expires.
      </div>

      <PhaseIndicator phase={phase} progress={progress} />

      <Field label="Username">
        <Input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!editable}
          placeholder="Username"
        />
      </Field>

      <Field label="Password">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!editable}
          placeholder="Password"
        />
      </Field>

      <Field label="TOTP seed (base32)">
        <Input
          type="password"
          autoComplete="off"
          value={totpSeed}
          onChange={(e) => setTotpSeed(e.target.value)}
          disabled={!editable}
          placeholder="TOTP seed"
          className="font-mono"
        />
      </Field>

      {errorMessage && <Alert>{errorMessage}</Alert>}

      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={busy || (phase.kind !== 'sync-error' && formMissing)}
          className="flex-1"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {buttonLabel}
        </Button>
        {phase.kind === 'sync-error' && (
          <Button variant="secondary" onClick={closeAfterSyncError}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}

function errorMessageFor(phase: AvanzaPhase): string | null {
  if (phase.kind === 'auth-error') return phase.message
  if (phase.kind === 'sync-error') {
    return `Connected, but initial sync failed: ${phase.message}. Click Retry sync, or close — the connection will sync next time.`
  }
  return null
}

type PhaseDotState = 'pending' | 'active' | 'done' | 'error'

function PhaseIndicator({
  phase,
  progress,
}: {
  phase: AvanzaPhase
  progress: SyncProgressUpdate | undefined
}) {
  if (phase.kind === 'idle' || phase.kind === 'auth-error') return null

  const view: Record<
    'authenticating' | 'syncing' | 'sync-error',
    { auth: PhaseDotState; sync: PhaseDotState; subtitle: string | null }
  > = {
    authenticating: {
      auth: 'active',
      sync: 'pending',
      subtitle: 'Verifying password + TOTP code with Avanza',
    },
    syncing: {
      auth: 'done',
      sync: 'active',
      subtitle: syncStageLabel(progress),
    },
    'sync-error': {
      auth: 'done',
      sync: 'error',
      subtitle: 'Sync failed — credentials are saved, retry below',
    },
  }
  const { auth: authState, sync: syncState, subtitle } = view[phase.kind]

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

const phaseDotStyles: Record<PhaseDotState, { dot: string; text: string }> = {
  pending: { dot: 'bg-text-faint/30', text: 'text-text-faint' },
  active: { dot: 'bg-foreground animate-pulse', text: 'text-foreground font-medium' },
  done: { dot: 'bg-pos', text: 'text-pos' },
  error: { dot: 'bg-neg', text: 'text-neg font-medium' },
}

function PhaseDot({ label, state }: { label: string; state: PhaseDotState }) {
  const { dot, text } = phaseDotStyles[state]
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', dot)} />
      <span className={cn('uppercase tracking-6', text)}>{label}</span>
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
