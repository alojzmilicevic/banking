// Avanza internal API endpoints. Cribbed from fhqvst/avanza and
// codler/avanza-api as reference. These can change at any time without
// notice — when they do, update them here.

export const BASE = 'https://www.avanza.se'

export const paths = {
  // Auth
  USERCREDENTIALS: '/_api/authentication/sessions/usercredentials',
  TOTP: '/_api/authentication/sessions/totp',
  BANKID_INITIATE: '/_api/authentication/sessions/bankid',
  BANKID_COLLECT: '/_api/authentication/sessions/bankid/collect',

  // Account data
  OVERVIEW: '/_mobile/account/overview',
  ACCOUNT_OVERVIEW: '/_mobile/account/{accountId}/overview',
  POSITIONS: '/_mobile/account/positions',
  TRANSACTIONS: '/_mobile/account/transactions/{accountOrType}',
  DEALS_AND_ORDERS: '/_mobile/account/dealsandorders',

  // Instruments
  INSTRUMENT: '/_mobile/market/{type}/{id}',
}

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
