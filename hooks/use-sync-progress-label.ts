import { useSyncProgress, type SyncProgressUpdate } from '@/lib/queries'

export interface SyncProgressInfo {
  progress: SyncProgressUpdate | undefined
  label: string
}

// Maps server-side sync progress to a human-readable label. Shared
// between the connect-button label and the phase indicator subtitle so
// they stay in lock-step.
export function syncStageLabel(p: SyncProgressUpdate | undefined): string {
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

export function useSyncProgressLabel(
  connectionId: string | null,
  active: boolean,
): SyncProgressInfo {
  const q = useSyncProgress(connectionId, active)
  return { progress: q.data, label: syncStageLabel(q.data) }
}
