import { type ReactNode } from 'react'
import { BackLink } from '@/app/components/BackLink'
import { SettingsNav } from './SettingsNav'

const SECTIONS = [
  { label: 'General', href: '/settings' as const },
  { label: 'Connectors', href: '/settings/connectors' as const },
  { label: 'About', href: '/settings/about' as const },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pt-6 pb-12 lg:flex-row lg:gap-12 lg:px-10 lg:pt-10">
      <aside className="mb-6 flex flex-col gap-5 lg:mb-0 lg:w-50 lg:shrink-0">
        <BackLink href="/" escapeKey>
          Back
        </BackLink>
        <h1 className="font-display text-32 tracking-display text-foreground">Settings</h1>
        <SettingsNav sections={SECTIONS} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-8 lg:pt-15">{children}</main>
    </div>
  )
}
