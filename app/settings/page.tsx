'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useAddHolder, useHolders } from '@/lib/queries'
import { SensitiveToggle, useSensitiveData } from '@/components/sensitive-data'
import { Alert } from '@/components/ui/alert'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { HolderAvatar } from '@/app/components/HolderAvatar'
import { cn } from '@/lib/utils'
import { SettingsRow, SettingsSection } from './SettingsSection'

export default function GeneralPage() {
  const holders = useHolders()
  const addHolder = useAddHolder()
  const { hidden } = useSensitiveData()
  const [showCombined, setShowCombined] = useLocalStorage<boolean>('aloma:show-combined', true)
  const [adding, setAdding] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submitAdd() {
    const label = draftLabel.trim()
    if (!label) return
    setError(null)
    try {
      await addHolder.mutateAsync({ label })
      setDraftLabel('')
      setAdding(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <SettingsSection title="Household">
        {holders.data?.map((h) => (
          <SettingsRow key={h.id} label={h.label} description={h.initials}>
            <HolderAvatar color={h.color}>{h.initials}</HolderAvatar>
          </SettingsRow>
        ))}
        {holders.isLoading && (
          <div className="py-3 text-12 text-text-faint">Loading household members…</div>
        )}

        {adding ? (
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
            <input
              autoFocus
              type="text"
              placeholder="Member name"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitAdd()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setDraftLabel('')
                  setError(null)
                }
              }}
              disabled={addHolder.isPending}
              className="rounded-md border border-input-border bg-input px-3 py-2 text-14 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            />
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitAdd}
                disabled={!draftLabel.trim() || addHolder.isPending}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-12 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addHolder.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Add member
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setDraftLabel('')
                  setError(null)
                }}
                disabled={addHolder.isPending}
                className="rounded-md border border-border bg-white/5 px-3 py-1.5 text-12 font-medium text-foreground transition-colors hover:bg-white/9"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border-subtle px-3 py-1.5 text-12 font-medium text-text-faint transition-colors hover:border-input-border hover:text-foreground"
          >
            <Plus className="size-3" />
            Add member
          </button>
        )}
      </SettingsSection>

      <SettingsSection title="Preferences">
        <SettingsRow
          label="Sensitive amounts"
          description={
            hidden
              ? 'Balances are hidden. Click to reveal.'
              : 'Balances are visible. Click to hide.'
          }
        >
          <SensitiveToggle />
        </SettingsRow>
        <SettingsRow
          label="Combined line"
          description={
            showCombined
              ? 'Wealth chart shows a combined line across all visible holders.'
              : 'Combined line is hidden.'
          }
        >
          <button
            type="button"
            onClick={() => setShowCombined((v) => !v)}
            aria-pressed={showCombined}
            className={cn(
              'inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border-subtle p-0.5 transition-colors',
              showCombined ? 'bg-primary/30' : 'bg-white/5',
            )}
          >
            <span
              className={cn(
                'size-4.5 rounded-full bg-foreground transition-transform',
                showCombined ? 'translate-x-3.5' : 'translate-x-0',
              )}
            />
          </button>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}
