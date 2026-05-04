// Account-type codes that flow through `accountType` on accounts. Providers
// emit raw strings (Avanza's product codes, EB's ISO 20022 cash account
// types), so the field stays an open union. `ACCOUNT_TYPE` lists only the
// codes we compare against by name — comparing via `ACCOUNT_TYPE.X` makes
// a typo a property-access error instead of a silently-false comparison.
// Add a code here when you need to branch on it.

export const ACCOUNT_TYPE = {
  ISK: 'INVESTERINGSSPARKONTO',
  AF: 'AKTIEFONDKONTO',
  KF: 'KAPITALFORSAKRING',
  CACC: 'CACC',
} as const

export type KnownAccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE]

// `(string & {})` keeps the union open so arbitrary provider strings still
// satisfy the type without a cast.
export type AccountType = KnownAccountType | (string & {})

// Accounts whose 30d % reflects market return rather than deposits/withdrawals.
// Pensions (TJP/IPS/PPM) are excluded — the providers don't expose flows
// cleanly enough to separate contributions from performance.
const PERFORMANCE_TYPES: ReadonlySet<string> = new Set([
  ACCOUNT_TYPE.ISK,
  ACCOUNT_TYPE.AF,
  ACCOUNT_TYPE.KF,
])

export function tracksPerformance(accountType: AccountType | null | undefined): boolean {
  return accountType != null && PERFORMANCE_TYPES.has(accountType)
}
