'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Esc anywhere inside /settings* takes the user back to the dashboard.
// Skips the handler when an open <input>/<textarea>/contenteditable is
// focused so it doesn't hijack form-clearing inside the Add member or
// Avanza credential panels.
export function EscapeToHome() {
  const router = useRouter()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      router.push('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])
  return null
}
