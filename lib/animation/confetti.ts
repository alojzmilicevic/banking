'use client'
// Tiny wrapper around canvas-confetti so callers don't need to think about
// the SSR-safe dynamic import.

import confetti from 'canvas-confetti'

export function celebrate() {
  if (typeof window === 'undefined') return
  // Two bursts from corner-ish origins so it feels less like a single
  // round explosion.
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.2, y: 0.4 },
    colors: ['#6ee7a7', '#6ea8ff', '#fbbf60', '#ffb3b3'],
    gravity: 0.9,
    scalar: 0.9,
  })
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.8, y: 0.4 },
    colors: ['#6ee7a7', '#6ea8ff', '#fbbf60', '#ffb3b3'],
    gravity: 0.9,
    scalar: 0.9,
  })
}
