// Display + filtering helpers for DashboardAccount that are reused by
// the sidebar, mobile layout, and popover menus. Keep these here (not in
// format.ts) so the dashboard type isn't pulled into pure formatting code.

import type { DashboardAccount } from '@/lib/api/dashboard'

// Structural type so this works for both the dashboard view-model
// (DashboardAccount) and the raw DB row (Account from drizzle), since
// both share these fields.
type AccountLabelable = {
  id: string
  name: string | null
  details: string | null
  product: string | null
  iban: string | null
}

// What to show in a row's primary line. Falls back through the most
// human-friendly fields first; if none are set, the optional `fallback`
// is used (e.g. "Account" on the detail page) before giving up and
// returning the raw id so empty rows never render blank.
export function accountLabel(a: AccountLabelable, fallback?: string): string {
  return a.details || a.product || a.name || a.iban || fallback || a.id
}

export interface AccountPartition {
  // Accounts the UI should render at all — the server includes the dupe
  // copies of joint accounts so callers can opt in, but the dashboard
  // surfaces always treat the canonical-only set as "the list".
  canonicals: DashboardAccount[]
  visible: DashboardAccount[]
  hidden: DashboardAccount[]
  // True when the user has hidden every canonical account — drives the
  // "Show all in totals" popover entry. Returns false for empty input
  // so empty sections don't claim they're hiding anything.
  allHidden: boolean
}

export function partitionAccounts(accounts: DashboardAccount[]): AccountPartition {
  const canonicals = accounts.filter((a) => !a.possibleDuplicateOf)
  const visible = canonicals.filter((a) => !a.excludedFromTotal)
  const hidden = canonicals.filter((a) => a.excludedFromTotal)
  return {
    canonicals,
    visible,
    hidden,
    allHidden: canonicals.length > 0 && visible.length === 0,
  }
}
