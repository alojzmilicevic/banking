import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-11 font-medium uppercase tracking-6 text-text-faint">
        {label}
      </label>
      {children}
    </div>
  )
}
