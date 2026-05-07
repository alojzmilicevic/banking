'use client'

import { useHolders } from '@/lib/queries'
import { useSensitiveData } from '@/components/sensitive-data'
import { HolderAvatar } from '@/app/components/HolderAvatar'
import { SettingsRow, SettingsSection } from './SettingsSection'

export default function GeneralPage() {
  const holders = useHolders()
  const { hidden, toggle } = useSensitiveData()

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
        {holders.data?.length === 0 && (
          <div className="py-3 text-12 text-text-faint">
            No household members yet. They're seeded automatically when you link your first bank.
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Preferences">
        <SettingsRow
          label="Sensitive amounts"
          description={
            hidden
              ? 'Balances start hidden. Click the eye icon to reveal.'
              : 'Balances are shown by default.'
          }
        >
          <button
            type="button"
            onClick={toggle}
            aria-pressed={hidden}
            className="rounded-7 border border-border bg-white/5 px-3 py-1.5 text-12 font-medium text-foreground transition-colors hover:bg-white/9"
          >
            {hidden ? 'Show by default' : 'Hide by default'}
          </button>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}
