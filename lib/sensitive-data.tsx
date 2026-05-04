'use client'
// Hide-sensitive-data primitives. A switch toggles a global "hide" flag
// (persisted to localStorage); <Sensitive> wraps any money value and
// renders it blurred while the flag is on. Pointer-down on a sensitive
// value reveals it for as long as the press is held — so the user can
// peek a single number without flipping the switch.
//
// Default is hidden. SSR always renders hidden so the first paint matches
// no-localStorage clients; useEffect rehydrates the persisted choice.

import { Eye, EyeOff } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

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
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === '0') setHidden(false)
      else if (stored === '1') setHidden(true)
    } catch {
      // localStorage unavailable (Safari private mode etc.) — keep default.
    }
  }, [])

  function toggle() {
    setHidden((v) => {
      const next = !v
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {}
      return next
    })
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

export function Sensitive({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { hidden } = useSensitiveData()
  const [peeking, setPeeking] = useState(false)
  const blurred = hidden && !peeking

  return (
    <span
      className={className}
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
      style={{
        display: 'inline-block',
        // em-relative so larger text gets a proportionally stronger blur
        // — a fixed px value let big topbar digits resolve while
        // over-blurring small chips.
        filter: blurred ? 'blur(0.4em)' : undefined,
        transition: 'filter 120ms ease',
        cursor: hidden ? 'pointer' : undefined,
        userSelect: hidden ? 'none' : undefined,
        WebkitUserSelect: hidden ? 'none' : undefined,
        touchAction: hidden ? 'none' : undefined,
      }}
    >
      {children}
    </span>
  )
}

export function SensitiveToggle({
  className,
  size = 18,
}: {
  className?: string
  size?: number
}) {
  const { hidden, toggle } = useSensitiveData()
  const Icon = hidden ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      aria-pressed={hidden}
      className={
        className ??
        'flex h-[34px] w-[34px] items-center justify-center rounded-full text-text-faint transition-colors hover:bg-[rgba(255,255,255,0.06)]'
      }
    >
      <Icon style={{ width: size, height: size }} />
    </button>
  )
}
