'use client'
// Hide-sensitive-data primitives. A switch toggles a global "hide" flag
// (persisted to localStorage); <Sensitive> wraps any money value and
// renders it blurred while the flag is on. Pointer-down on a sensitive
// value reveals it for as long as the press is held — so the user can
// peek a single number without flipping the switch.
//
// Default is hidden. SSR always renders hidden so the first paint matches
// no-localStorage clients; useSyncExternalStore rehydrates the persisted
// choice on mount.

import { Eye, EyeOff } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { cn } from '@/lib/utils'

type Ctx = {
  hidden: boolean
  toggle: () => void
}

const SensitiveDataContext = createContext<Ctx>({
  hidden: true,
  toggle: () => {},
})

const STORAGE_KEY = 'aloma:hide-sensitive'

export function SensitiveDataProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useLocalStorage<boolean>(STORAGE_KEY, true)

  function toggle() {
    setHidden((v) => !v)
  }

  return (
    <SensitiveDataContext.Provider value={{ hidden, toggle }}>
      {children}
    </SensitiveDataContext.Provider>
  )
}

export function useSensitiveData(): Ctx {
  return useContext(SensitiveDataContext)
}

export function Sensitive({ children, className }: { children: ReactNode; className?: string }) {
  const { hidden } = useSensitiveData()
  const [peeking, setPeeking] = useState(false)
  const blurred = hidden && !peeking

  return (
    <span
      // Blur radius is em-relative so larger text gets a proportionally
      // stronger blur — a fixed px let big topbar digits resolve while
      // over-blurring small chips.
      className={cn(
        // Pseudo-element extends the pointer hit area ~4px beyond the text
        // box without affecting layout — peek is finicky on small numbers.
        "relative inline-block transition-[filter] duration-150 ease-out before:absolute before:-inset-1 before:content-['']",
        hidden && 'cursor-pointer touch-none select-none',
        blurred && 'filter-[blur(0.4em)]',
        className,
      )}
      onPointerDown={(e) => {
        if (!hidden) return
        // Don't open the underlying account row / button — the user is
        // peeking the number, not clicking the parent.
        e.stopPropagation()
        setPeeking(true)
      }}
      onPointerUp={() => setPeeking(false)}
      onPointerLeave={() => setPeeking(false)}
      onPointerCancel={() => setPeeking(false)}
      onClick={(e) => {
        if (hidden) e.stopPropagation()
      }}
    >
      {children}
    </span>
  )
}

export function SensitiveToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useSensitiveData()
  const Icon = hidden ? EyeOff : Eye
  return (
    <IconButton
      onClick={toggle}
      aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-pressed={hidden}
      className={className}
    >
      <Icon className="size-4.5" />
    </IconButton>
  )
}
