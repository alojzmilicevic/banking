// Provider-agnostic, normalized shapes used by the sync orchestrator and
// domain layer. Each provider implementation is responsible for translating
// its own API responses into these.

export interface NormalizedAccount {
  id: string // canonical: provider's stable account id (e.g. EB uid)
  name?: string | null
  details?: string | null // user's alias for the account
  product?: string | null
  accountType?: string | null
  currency?: string | null
  iban?: string | null
  bban?: string | null
  bic?: string | null
  raw: unknown
}

export interface NormalizedBalance {
  accountId: string
  balanceType: string // closingBooked, expected, ...
  amount: number // signed
  currency: string
  referenceDate?: string | null // YYYY-MM-DD
  raw: unknown
}

export interface NormalizedTransaction {
  accountId: string
  fingerprint: string // stable dedup key
  date: string // YYYY-MM-DD (booking_date preferred)
  amount: number // signed: +credit, -debit
  currency: string
  status?: string | null // BOOK | PDNG | INFO | null
  description?: string | null
  counterparty?: string | null
  raw: unknown
}

export interface NormalizedPosition {
  accountId: string
  instrumentId: string
  instrumentName?: string | null
  instrumentType?: string | null
  quantity: number
  avgCost?: number | null
  marketValue?: number | null
  currency: string
  raw: unknown
}

export interface SyncResult {
  accounts: NormalizedAccount[]
  balances: NormalizedBalance[]
  transactions: NormalizedTransaction[]
  positions?: NormalizedPosition[]
  syncWindow: { from: string; to: string } // YYYY-MM-DD inclusive
}

export interface StartAuthInput {
  // Provider-specific shape passed via `extra`.
  redirectUrl: string
  state: string
  extra: Record<string, unknown>
}

export interface StartAuthResult {
  url: string
  authorizationId?: string
}

export interface CompleteAuthInput {
  code: string
  state: string
}

export interface CompleteAuthResult {
  externalId: string // provider's session id, to store on the connection
  validUntil?: number | null // unix ms
  label?: string
  raw: unknown
}

export interface ConnectionContext {
  externalId: string
  rawJson: string | null
}

export interface SyncOptions {
  // ISO date inclusive. If undefined, the orchestrator passes 'initial' for
  // the very first sync and the provider may interpret as "max history".
  since: Date
  until: Date
}

export interface Provider {
  readonly id: string
  readonly name: string

  listInstitutions?(country: string): Promise<unknown>
  startAuth(input: StartAuthInput): Promise<StartAuthResult>
  completeAuth(input: CompleteAuthInput): Promise<CompleteAuthResult>
  sync(connection: ConnectionContext, opts: SyncOptions): Promise<SyncResult>
}
