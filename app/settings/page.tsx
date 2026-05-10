'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useAddHolder, useHolders } from '@/lib/queries'
import { SensitiveToggle, useSensitiveData } from '@/components/sensitive-data'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { HolderAvatar } from '@/app/components/HolderAvatar'
import { HolderColorPicker } from '@/app/components/HolderColorPicker'
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

  function cancelAdd() {
    setAdding(false)
    setDraftLabel('')
    setError(null)
  }

  return (
    <>
      <SettingsSection title="Household">
        {holders.data?.map((h) => (
          <SettingsRow key={h.id} label={h.label}>
            <div className="flex items-center gap-3">
              <HolderColorPicker holderId={h.id} currentColor={h.color} />
              <HolderAvatar color={h.color}>{h.initials}</HolderAvatar>
            </div>
          </SettingsRow>
        ))}
        {holders.isLoading && (
          <div className="py-3 text-12 text-text-faint">Loading household members…</div>
        )}

        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitAdd()
            }}
            className="flex flex-col gap-2 border-t border-border-subtle pt-3"
          >
            <Input
              autoFocus
              type="text"
              placeholder="Member name"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelAdd()
              }}
              disabled={addHolder.isPending}
              className="px-3 text-14"
            />
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="xs"
                disabled={!draftLabel.trim() || addHolder.isPending}
                className="flex-1"
              >
                {addHolder.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Add member
              </Button>
              <button
                type="button"
                onClick={cancelAdd}
                disabled={addHolder.isPending}
                className="rounded-md border border-border bg-white/5 px-3 py-1.5 text-12 font-medium text-foreground transition-colors hover:bg-white/9"
              >
                Cancel
              </button>
            </div>
          </form>
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
            aria-label="Toggle combined line"
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
