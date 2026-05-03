// Avanza internal API endpoints (reverse-engineered from the live frontend
// at avanza.se). These can change at any time without notice — when they
// do, update them here.

export const BASE = 'https://www.avanza.se'

export const paths = {
  // Auth — username + password followed by a TOTP code. See
  // lib/providers/avanza/auth/login.ts for the two-step dance. BankID
  // server-side was attempted but Avanza's TLS/HTTP fingerprint check
  // rejected the resulting session jar.
  USERCREDENTIALS: '/_api/authentication/sessions/usercredentials',
  TOTP: '/_api/authentication/sessions/totp',

  // Account data — the new /_api/account-overview/* family that the
  // current avanza.se frontend uses. Cookie-authenticated.
  CATEGORIZED_ACCOUNTS: '/_api/account-overview/overview/categorizedAccounts',

  // POST endpoints — require X-SecurityToken: <AZACSRF cookie value>.
  TOTAL_VALUES: '/_api/account-performance/overview/total-values',
  CHART_TIMEPERIOD: '/_api/account-performance/overview/chart/accounts/timeperiod',
}

// Time periods accepted by the chart/timeperiod endpoint.
export type ChartTimePeriod =
  | 'TODAY'
  | 'ONE_WEEK'
  | 'ONE_MONTH'
  | 'THREE_MONTHS'
  | 'THIS_YEAR'
  | 'ONE_YEAR'
  | 'THREE_YEARS'
  | 'FIVE_YEARS'
  | 'ALL_TIME'

// Avanza account type codes → our normalized AccountKind.
export const ACCOUNT_TYPE_KIND: Record<string, 'cash' | 'investment' | 'pension'> = {
  // Cash-only at Avanza
  SPARKONTO: 'cash',
  CREDIT_ACCOUNT: 'cash',

  // Investments
  AKTIEFONDKONTO: 'investment', // AF — taxable trading account
  INVESTERINGSSPARKONTO: 'investment', // ISK
  KAPITALFORSAKRING: 'investment', // KF
  KAPITAL_PENSION: 'investment',

  // Pensions
  TJANSTEPENSION: 'pension',
  IPS: 'pension',
  PPM: 'pension',
}
