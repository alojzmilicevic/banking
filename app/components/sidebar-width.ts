// Shared constants for the resizable sidebar. The width is persisted in
// a cookie so the server can read it during SSR and render the HTML at
// the right width on first paint — no client-side flicker.

export const SIDEBAR_DEFAULT_WIDTH = 320
export const SIDEBAR_MIN_WIDTH = 290
export const SIDEBAR_MAX_WIDTH = 520
export const SIDEBAR_WIDTH_COOKIE = 'aloma-sidebar-width'

export function clampSidebarWidth(n: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, n))
}
