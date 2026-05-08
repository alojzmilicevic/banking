// Instruments repository — drizzle queries only.
//
// Note: bulk-upsert during sync runs inside the persist-sync-result macro
// so all writes are atomic; this single-row helper is here for any callers
// that just need to upsert one instrument outside a sync.

import { db, instruments, type Executor } from '@/lib/db/client'

export interface InstrumentInput {
  id: string
  type: string
  name: string | null
  ticker: string | null
  currency: string | null
  isin: string | null
  providerId: string | null
  providerInstrumentId: string | null
}

export function upsert(
  input: InstrumentInput,
  now: number = Date.now(),
  executor: Executor = db,
): void {
  executor.insert(instruments)
    .values({
      id: input.id,
      type: input.type,
      name: input.name,
      ticker: input.ticker,
      currency: input.currency,
      isin: input.isin,
      providerId: input.providerId,
      providerInstrumentId: input.providerInstrumentId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: instruments.id,
      set: {
        type: input.type,
        name: input.name,
        ticker: input.ticker,
        currency: input.currency,
        isin: input.isin,
        updatedAt: now,
      },
    })
    .run()
}
