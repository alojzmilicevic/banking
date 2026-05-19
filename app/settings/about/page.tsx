import { buildInfo } from '@/lib/build-info'
import { SettingsRow, SettingsSection } from '../SettingsSection'

export default function AboutPage() {
  const builtAt = new Date(buildInfo.buildTime).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <SettingsSection title="About">
      <SettingsRow
        label="Build version"
        description={`${buildInfo.buildId} · built ${builtAt}`}
      >
        <span className="font-mono text-12 text-text-faint">{buildInfo.buildName}</span>
      </SettingsRow>
    </SettingsSection>
  )
}
