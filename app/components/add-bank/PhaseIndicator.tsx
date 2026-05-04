import { syncStageLabel } from '@/hooks/use-sync-progress-label'
import type { AvanzaPhase } from '@/hooks/use-avanza-connect-flow'
import type { SyncProgressUpdate } from '@/lib/queries'

// Two-step indicator with a sub-line that surfaces the live progress
// stage during sync. The dot states are: pending (muted), active
// (pulsing), done (green check), error (red).
export function PhaseIndicator({
  phase,
  progress,
}: {
  phase: AvanzaPhase
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
