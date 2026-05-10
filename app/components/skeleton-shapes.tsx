// Static, non-interactive copy of PeriodTabs — same dimensions, no motion,
// no onClick. Used in skeleton states where we want the layout locked but
// no clickability.
export function PeriodTabsShape() {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-9 border border-border-subtle bg-elevated p-0.75">
      {['1W', '1M', '3M', '1Y', 'All'].map((label) => (
        <span
          key={label}
          className="rounded-7 px-3.25 py-1.25 text-xs font-medium text-text-faint"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

// Reusable chart-shape skeleton (legend-less). Used both by the full
// Dashboard skeleton and by Timeline's period-switch loading state.
// Multiple instances may coexist in the DOM (desktop + mobile skeletons
// render simultaneously, only one is visible per breakpoint), but the
// gradient is identical across instances so a single shared id is fine —
// browsers resolve the first matching `<defs>` in document order, and
// the visual result is the same. A static id also avoids `useId()`-based
// hydration mismatches when the surrounding React tree differs slightly
// between server and client (e.g. cached query state).
const GRADIENT_ID = 'skeleton-area'

export function ChartShape() {
  return (
    <div className="relative size-full overflow-hidden">
      <svg
        className="absolute inset-0 size-full animate-pulse motion-reduce:animate-none"
        preserveAspectRatio="none"
        viewBox="0 0 400 200"
      >
        <defs>
          <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
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
          fill={`url(#${GRADIENT_ID})`}
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
