import { useId } from 'react'

// Static, non-interactive copy of PeriodTabs — same dimensions, no motion,
// no onClick. Used in skeleton states where we want the layout locked but
// no clickability.
export function PeriodTabsShape() {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[9px] border border-border-subtle p-[3px]"
      style={{ background: 'var(--color-elevated)' }}
    >
      {['1W', '1M', '3M', '1Y', 'All'].map((label) => (
        <span
          key={label}
          className="rounded-[7px] px-[13px] py-[5px] text-xs font-medium text-text-faint"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

// Reusable chart-shape skeleton (legend-less). Used both by the full
// Dashboard skeleton and by Timeline's period-switch loading state.
// Each instance generates a unique gradient id so multiple charts can
// coexist in the DOM (desktop + mobile skeletons render simultaneously,
// only one is visible per breakpoint).
export function ChartShape() {
  const gradientId = `skeleton-area-${useId()}`
  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        className="absolute inset-0 h-full w-full animate-pulse motion-reduce:animate-none"
        preserveAspectRatio="none"
        viewBox="0 0 400 200"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {[40, 80, 120, 160].map((y) => (
          <line
            key={y}
            x1="0"
            x2="400"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="2 4"
          />
        ))}
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,95 240,70 C280,50 320,80 360,40 L400,30 L400,200 L0,200 Z"
          fill={`url(#${gradientId})`}
        />
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,95 240,70 C280,50 320,80 360,40 L400,30"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  )
}
