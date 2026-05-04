// Account-type codes that flow through `accountType` on accounts. Providers
// emit raw strings (Avanza's product codes, EB's ISO 20022 cash account
// types), so the field stays an open union — but listing the codes we know
// gives autocomplete on assignment and lets callers compare via
// `ACCOUNT_TYPE.X` for typo-safety instead of bare string literals.

export const ACCOUNT_TYPE = {
  // Avanza
  SPARKONTO: 'SPARKONTO',
  CREDIT_ACCOUNT: 'CREDIT_ACCOUNT',
  AKTIEFONDKONTO: 'AKTIEFONDKONTO',
  INVESTERINGSSPARKONTO: 'INVESTERINGSSPARKONTO',
  KAPITALFORSAKRING: 'KAPITALFORSAKRING',
  KAPITAL_PENSION: 'KAPITAL_PENSION',
  TJANSTEPENSION: 'TJANSTEPENSION',
  IPS: 'IPS',
  PPM: 'PPM',
  // Enable Banking (ISO 20022 cash account types)
  CACC: 'CACC',
  SVGS: 'SVGS',
  CARD: 'CARD',
} as const

export type KnownAccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE]

// `(string & {})` keeps the union open: known codes get autocomplete, but
// arbitrary provider strings still satisfy the type without a cast.
export type AccountType = KnownAccountType | (string & {})
