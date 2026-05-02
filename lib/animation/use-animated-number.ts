'use client'
// Tween a numeric value with an ease-out curve. Re-tweens whenever the
// target changes so that real-time updates (sync results in) animate too.

import { useEffect, useRef, useState } from 'react'

export function useAnimatedNumber(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target)
  const frameRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const fromRef = useRef<number>(target)

  useEffect(() => {
    fromRef.current = value
    startRef.current = performance.now()
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)

    function step(now: number) {
      const t = Math.min(1, (now - startRef.current) / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const next = fromRef.current + (target - fromRef.current) * eased
      setValue(next)
      if (t < 1) frameRef.current = requestAnimationFrame(step)
      else frameRef.current = null
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
    // value is intentionally excluded — we capture it as `from` once per target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}
