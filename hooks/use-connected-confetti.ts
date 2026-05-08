'use client'

import { useEffect } from 'react'
import { celebrate } from '@/lib/animation/confetti'

// Fires confetti once if the page just landed from a successful OAuth
// callback (?connected on the URL), then strips the param from history
// so a refresh doesn't trigger it again.
export function useConnectedConfetti() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (!sp.get('connected')) return
    celebrate()
    const url = new URL(window.location.href)
    url.searchParams.delete('connected')
    window.history.replaceState({}, '', url.toString())
  }, [])
}
