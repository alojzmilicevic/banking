import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// People in the household. Multi-user from day one.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
})

// One row per (user × provider × external auth session).
// E.g. Alojz's Handelsbanken via Enable Banking is one connection,
// Alma's Avanza is another, etc.
export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // 'enable-banking', 'avanza', ...
    externalId: text('external_id').notNull(), // provider's session/connection id
    label: text('label'), // e.g. "Handelsbanken (SE)"
    status: text('status').notNull().default('active'), // 'active' | 'expired' | 'revoked'
    validUntil: integer('valid_until'), // unix ms; nullable
    initialSyncedAt: integer('initial_synced_at'), // unix ms; null until first 365d sync done
    lastSyncedAt: integer('last_synced_at'), // unix ms
    rawJson: text('raw_json'), // provider-specific extras (aspsp name, country, etc.)
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('connections_by_user').on(t.userId),
    byProvider: uniqueIndex('connections_provider_external').on(t.providerId, t.externalId),
  }),
)

// Pending OAuth-style auth flows. Cleaned up after callback exchange.
export const authStates = sqliteTable('auth_states', {
  state: text('state').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  payload: text('payload').notNull(), // JSON: provider-specific (aspsp name, country, ...)
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
})

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(), // canonical: provider's account uid
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    name: text('name'), // holder name
    details: text('details'), // user's alias for the account
    product: text('product'),
    accountType: text('account_type'), // CACC, CARD, INVESTMENT, etc.
    currency: text('currency'),
    iban: text('iban'),
    bban: text('bban'),
    bic: text('bic'),
    rawJson: text('raw_json').notNull(),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byConnection: index('accounts_by_connection').on(t.connectionId),
  }),
)

// Latest balance snapshot per account+type. Replaced on each sync.
export const balances = sqliteTable(
  'balances',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    balanceType: text('balance_type').notNull(), // closingBooked, expected, ...
    amount: real('amount').notNull(),
    currency: text('currency').notNull(),
    referenceDate: text('reference_date'), // YYYY-MM-DD
    rawJson: text('raw_json').notNull(),
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('balances_pk').on(t.accountId, t.balanceType),
  }),
)

// Bank/card transactions and (eventually) investment cash movements.
export const transactions = sqliteTable(
  'transactions',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD (booking_date preferred)
    amount: real('amount').notNull(), // signed: +credit, -debit
    currency: text('currency').notNull(),
    status: text('status'), // BOOK | PDNG | INFO | null
    description: text('description'),
    counterparty: text('counterparty'), // creditor/debtor name
    rawJson: text('raw_json').notNull(),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('transactions_pk').on(t.accountId, t.fingerprint),
    byAccountDate: index('transactions_by_account_date').on(t.accountId, t.date),
  }),
)

// Investment positions — for Avanza etc. Empty initially.
export const positions = sqliteTable(
  'positions',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id').notNull(), // ISIN or provider id
    instrumentName: text('instrument_name'),
    instrumentType: text('instrument_type'), // STOCK | FUND | ETF | BOND | CASH
    quantity: real('quantity').notNull(),
    avgCost: real('avg_cost'),
    marketValue: real('market_value'),
    currency: text('currency').notNull(),
    rawJson: text('raw_json').notNull(),
    fetchedAt: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: uniqueIndex('positions_pk').on(t.accountId, t.instrumentId),
  }),
)

export type User = typeof users.$inferSelect
export type Connection = typeof connections.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Balance = typeof balances.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Position = typeof positions.$inferSelect
