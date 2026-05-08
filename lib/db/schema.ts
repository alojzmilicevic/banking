import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// One row per "household" (single-tenant for now — there's typically one
// users row that represents the whole household, with N holders below).
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
})

// Members of the household. N people supported (was hardcoded 'alma' /
// 'alojz' before). Display label, color, and order all live here so the
// UI iterates rows instead of referencing names by literal id.
export const holders = sqliteTable(
  'holders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    color: text('color').notNull(),
    initials: text('initials'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('holders_by_user').on(t.userId),
  }),
)

// One row per (user × provider × external auth session).
export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // 'enable-banking', 'avanza', ...
    externalId: text('external_id').notNull(), // provider's session id
    label: text('label'),
    status: text('status').notNull().default('active'),
    validUntil: integer('valid_until'),
    initialSyncedAt: integer('initial_synced_at'),
    lastSyncedAt: integer('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    rawJson: text('raw_json'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('connections_by_user').on(t.userId),
    byProvider: uniqueIndex('connections_provider_external').on(t.providerId, t.externalId),
  }),
)

// Many-to-many: which holder(s) own a given connection.
//   • 0 rows → unassigned (legacy connection or user hasn't set ownership)
//   • 1 row  → personal account
//   • 2+ rows → explicitly joint (in addition to auto-joint detection that
//              fires when the same IBAN appears under different holders'
//              connections; the dashboard service unions both signals).
export const connectionHolders = sqliteTable(
  'connection_holders',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    holderId: text('holder_id')
      .notNull()
      .references(() => holders.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.connectionId, t.holderId] }),
    byHolder: index('connection_holders_by_holder').on(t.holderId),
  }),
)

// Encrypted credentials for providers that need stored creds (Avanza
// password+TOTP). Empty for OAuth-style providers like EB. AES-256-GCM with
// a key from env var (BANKING_SECRET).
export const connectionCredentials = sqliteTable('connection_credentials', {
  connectionId: text('connection_id')
    .primaryKey()
    .references(() => connections.id, { onDelete: 'cascade' }),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
})

// Pending auth flows. Polling flows (BankID) live here too, until completion.
export const authStates = sqliteTable('auth_states', {
  state: text('state').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  flow: text('flow').notNull().default('redirect'), // 'redirect' | 'bankid' | 'credentials'
  status: text('status').notNull().default('pending'), // 'pending' | 'complete' | 'error'
  payload: text('payload').notNull(), // provider-specific JSON
  result: text('result'), // JSON: connectionId on complete, error msg on failure
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  expiresAt: integer('expires_at').notNull(),
})

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    // Logical kind drives wealth computation:
    // 'cash' | 'card' | 'investment' | 'pension'
    kind: text('kind'),
    // 'sole' | 'joint'
    ownership: text('ownership').notNull().default('sole'),
    // When 1, this account is hidden from the user's total wealth chart
    // (e.g. accounts owned by family members synced for visibility only,
    // or empty/inactive accounts cluttering the list).
    excludedFromTotal: integer('excluded_from_total').notNull().default(0),
    name: text('name'),
    details: text('details'),
    product: text('product'),
    accountType: text('account_type'), // raw provider type code (CACC, ISK, KF, …)
    currency: text('currency'),
    iban: text('iban'),
    bban: text('bban'),
    bic: text('bic'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byConnection: index('accounts_by_connection').on(t.connectionId),
  }),
)

// Latest cash balance snapshot per account+type. Replaced on each sync.
export const balances = sqliteTable(
  'balances',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    balanceType: text('balance_type').notNull(),
    amount: real('amount').notNull(),
    currency: text('currency').notNull(),
    referenceDate: text('reference_date'),
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('balances_pk').on(t.accountId, t.balanceType),
  }),
)

// Shared catalog of stocks / funds / ETFs / bonds. Multiple positions across
// users/accounts reference the same instrument row.
export const instruments = sqliteTable('instruments', {
  // ISIN if available, else `${providerId}:${providerInstrumentId}`.
  id: text('id').primaryKey(),
  type: text('type').notNull(), // STOCK | FUND | ETF | BOND | CERTIFICATE | ...
  name: text('name'),
  ticker: text('ticker'),
  currency: text('currency'),
  isin: text('isin'),
  providerId: text('provider_id'),
  providerInstrumentId: text('provider_instrument_id'),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
})

// One row per (account × instrument). Replaces the earlier `positions` table
// shape. Snapshot semantics — replaced on each sync.
export const positions = sqliteTable(
  'positions',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id),
    quantity: real('quantity').notNull(),
    avgCost: real('avg_cost'),
    // Market value in the position's own currency (USD, SEK, …).
    marketValue: real('market_value'),
    currency: text('currency').notNull(),
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('positions_pk').on(t.accountId, t.instrumentId),
  }),
)

// Cash flows + instrument events. `kind` is the closed enum that drives all
// downstream computations (spending breakdowns, wealth deltas, etc.).
export const transactions = sqliteTable(
  'transactions',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    // 'cash_in' | 'cash_out' | 'transfer_in' | 'transfer_out' |
    // 'buy' | 'sell' | 'dividend' | 'interest' | 'fee' | 'tax' | 'fx' | 'other'
    kind: text('kind'),
    amount: real('amount').notNull(), // signed, account currency
    currency: text('currency').notNull(),
    instrumentId: text('instrument_id').references(() => instruments.id),
    quantity: real('quantity'), // for buy/sell
    status: text('status'),
    description: text('description'),
    counterparty: text('counterparty'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('transactions_pk').on(t.accountId, t.fingerprint),
    byAccountDate: index('transactions_by_account_date').on(t.accountId, t.date),
    byKind: index('transactions_by_kind').on(t.kind),
  }),
)

// One row per (user × date). Computed after every sync. The chart reads
// this table directly. Investment values come from positions × marketValue
// at snapshot time, so this captures market drift even on no-tx days.
export const dailySnapshots = sqliteTable(
  'daily_snapshots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    baseCurrency: text('base_currency').notNull(),
    totalAmount: real('total_amount').notNull(),
    cashAmount: real('cash_amount').notNull(),
    investmentAmount: real('investment_amount').notNull(),
    detailJson: text('detail_json').notNull(), // per-account breakdown
    computedAt: integer('computed_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('snapshots_pk').on(t.userId, t.date),
  }),
)

// Daily total value per account (one row per (account, date)). Currently
// populated from Avanza's chart/timeperiod endpoint — gives us the actual
// historical value of an investment account on each calendar day,
// including market drift between transactions. Empty for cash-only
// providers; the snapshot builder falls back to tx walkback for those.
export const accountValueHistory = sqliteTable(
  'account_value_history',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    value: real('value').notNull(),
    // Cumulative SEK gain since the chart's anchor day (Avanza: ~366 days
    // ago). Provider-supplied (Avanza's `absoluteSeries`); null for
    // providers that don't expose a deposit-adjusted return series.
    // Difference between two days = real growth over that subwindow,
    // independent of deposits/withdrawals.
    growth: real('growth'),
    currency: text('currency').notNull(),
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('account_value_history_pk').on(t.accountId, t.date),
  }),
)

export type User = typeof users.$inferSelect
// Named `HolderRow` (not `Holder`) to avoid clashing with the legacy
// literal-union `Holder` in lib/api/schemas.ts during the transition.
// Once that union is gone, this can be renamed to `Holder`.
export type HolderRow = typeof holders.$inferSelect
export type AccountValueHistory = typeof accountValueHistory.$inferSelect
export type Connection = typeof connections.$inferSelect
export type ConnectionHolder = typeof connectionHolders.$inferSelect
export type ConnectionCredential = typeof connectionCredentials.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Balance = typeof balances.$inferSelect
export type Instrument = typeof instruments.$inferSelect
export type Position = typeof positions.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type DailySnapshot = typeof dailySnapshots.$inferSelect
