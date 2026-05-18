'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useHolders } from '@/lib/queries'
import { SensitiveToggle, useSensitiveData } from '@/components/sensitive-data'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { AddHolderDialog } from '@/app/components/AddHolderDialog'
import { HolderAvatar } from '@/app/components/HolderAvatar'
import { HolderColorPicker } from '@/app/components/HolderColorPicker'
import { cn } from '@/lib/utils'
import { SettingsRow, SettingsSection } from './SettingsSection'

export default function GeneralPage() {
  const holders = useHolders()
  const { hidden } = useSensitiveData()
  const [showCombined, setShowCombined] = useLocalStorage<boolean>('aloma:show-combined', true)
  const [adding, setAdding] = useState(false)

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

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border-subtle px-3 py-1.5 text-12 font-medium text-text-faint transition-colors hover:border-input-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Plus className="size-3" />
          Add member
        </button>
      </SettingsSection>

      <AddHolderDialog open={adding} onClose={() => setAdding(false)} />

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
