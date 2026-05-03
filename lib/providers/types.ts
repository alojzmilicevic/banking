// Provider-agnostic shapes used by the sync orchestrator and domain layer.
// Each provider implementation translates its own API into these.

export type AuthFlow = 'redirect' | 'bankid' | 'credentials' | 'apikey'

// What a provider returns from startAuth / pollAuth — the front end uses
// `kind` to decide what to render or do next.
export type AuthChallenge =
  | { kind: 'redirect'; url: string; state: string; expiresAt: number }
  | {
      kind: 'polling'
      state: string
      pollEveryMs: number
      expiresAt: number
      instructions: string
      // Some flows surface info during polling (e.g. BankID device QR/autostart).
      hint?: Record<string, unknown>
    }
  | { kind: 'pending'; state: string; instructions: string; hint?: Record<string, unknown> }
  | { kind: 'complete'; connectionId: string }
  | { kind: 'error'; state?: string; message: string }

export interface ConnectionMaterial {
  externalId: string // provider's session/connection id
  validUntil?: number | null // unix ms
  label?: string
  raw: unknown
}

// Schema for a form field a provider asks the UI to render before startAuth.
export interface FormField {
  name: string
  label: string
  type: 'text' | 'password' | 'tel'
  placeholder?: string
  pattern?: string
  required?: boolean
}

export interface AccountCapability {
  cash?: boolean
  investments?: boolean
  pensions?: boolean
  cards?: boolean
}

// ── Normalized data shapes ──────────────────────────────────────────────

export type AccountKind = 'cash' | 'card' | 'investment' | 'pension'

export interface NormalizedAccount {
  id: string
  kind: AccountKind
  ownership?: 'sole' | 'joint'
  name?: string | null
  details?: string | null
  product?: string | null
  accountType?: string | null
  currency?: string | null
  iban?: string | null
  bban?: string | null
  bic?: string | null
}

export interface NormalizedBalance {
  accountId: string
  balanceType: string
  amount: number
  currency: string
  referenceDate?: string | null
}

export type TransactionKind =
  | 'cash_in'
  | 'cash_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'tax'
  | 'fx'
  | 'other'

export interface NormalizedTransaction {
  accountId: string
  fingerprint: string
  date: string // YYYY-MM-DD
  kind: TransactionKind
  amount: number // signed, account currency
  currency: string
  instrumentId?: string | null
  quantity?: number | null
  status?: string | null
  description?: string | null
  counterparty?: string | null
}

export interface NormalizedInstrument {
  // Stable id: ISIN preferred, else `${providerId}:${providerInstrumentId}`.
  id: string
  type: string // STOCK | FUND | ETF | BOND | CERTIFICATE | CASH | ...
  name?: string | null
  ticker?: string | null
  currency?: string | null
  isin?: string | null
  providerId?: string | null
  providerInstrumentId?: string | null
}

export interface NormalizedPosition {
  accountId: string
  instrumentId: string
  quantity: number
  avgCost?: number | null
  marketValue?: number | null
  currency: string
}

export interface NormalizedDailyValue {
  accountId: string
  date: string // YYYY-MM-DD
  value: number
  currency: string
}

export interface SyncResult {
  accounts: NormalizedAccount[]
  balances: NormalizedBalance[]
  transactions: NormalizedTransaction[]
  instruments?: NormalizedInstrument[]
  positions?: NormalizedPosition[]
  // Per-account historical daily values (e.g. Avanza's chart series).
  // Only present for providers that expose this; cash-only providers
  // leave it empty and rely on tx walkback in the snapshot builder.
  dailyValues?: NormalizedDailyValue[]
  // Provider-rotated credentials to persist after this sync. Avanza
  // rotates session cookies (notably AZACSRF) on most data calls — without
  // this round-trip the stored jar drifts behind the live session.
  refreshedCredentials?: Record<string, unknown>
  // Push connections.validUntil forward when a successful sync proves the
  // session is still alive. Used by Avanza, which has no client-readable
  // session lifetime; EB leaves this unset since its validUntil is the
  // PSD2 consent expiry agreed at link time.
  connectionValidUntil?: number
  syncWindow: { from: string; to: string }
}

export interface ConnectionContext {
  id: string
  externalId: string
  rawJson: string | null
  // Decrypted credentials, if the provider stored any. Undefined for
  // OAuth-style providers.
  credentials?: Record<string, unknown>
}

export interface SyncOptions {
  since: Date
  until: Date
}

// ── Provider interface ──────────────────────────────────────────────────

export interface StartAuthInput {
  userId: string
  flow: AuthFlow
  redirectUrl: string // for redirect flows
  state: string
  input: Record<string, unknown> // form values etc.
}

export interface PollAuthInput {
  state: string
  payload: Record<string, unknown>
}

export interface CompleteAuthInput {
  state: string
  code?: string
  payload?: Record<string, unknown>
}

export interface Provider {
  readonly id: string
  readonly name: string
  readonly capabilities: AccountCapability
  readonly authFlows: AuthFlow[]

  // What the front end should ask the user to fill in BEFORE startAuth, per
  // flow. e.g. BankID needs a personnummer; credentials needs username/pw/totp.
  authFormSchema?(flow: AuthFlow): FormField[]

  listInstitutions?(country: string): Promise<unknown>

  startAuth(input: StartAuthInput): Promise<AuthChallenge>
  pollAuth?(input: PollAuthInput): Promise<AuthChallenge>
  completeAuth?(input: CompleteAuthInput): Promise<ConnectionMaterial>

  sync(connection: ConnectionContext, opts: SyncOptions): Promise<SyncResult>
}
