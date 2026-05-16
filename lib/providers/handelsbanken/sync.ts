import type { ConnectionContext, SyncOptions, SyncResult } from '../types'
import { clearSyncProgress, setSyncProgress } from '@/lib/sync/progress'
import * as holdersRepo from '@/lib/repositories/holders'
import { scrapeHandelsbanken } from './scrape'
import { normalizeHandelsbanken } from './normalize'
import { fetchHbDailyValues } from './nav'

export async function hbSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  try {
    return await doSync(connection, opts)
  } catch (e) {
    setSyncProgress(connection.id, { stage: 'error', message: (e as Error).message })
    throw e
  } finally {
    // Same five-second hold as Avanza — gives the last poll a window to
    // see the terminal state before it clears.
    setTimeout(() => clearSyncProgress(connection.id), 5_000)
  }
}

async function doSync(
  connection: ConnectionContext,
  opts: SyncOptions,
): Promise<SyncResult> {
  // Look up the personnummer of the holder this connection belongs to,
  // so the scrape can autofill HB's BankID prompt. The connection's
  // first owning holder wins — for explicitly-joint HB connections the
  // user would have to swap to whichever holder owns the BankID being
  // signed with, but that's a non-issue in practice (BankID is a
  // single-person credential).
  const ownerIds = holdersRepo.getHolderIdsByConnection([connection.id]).get(connection.id) ?? []
  const owner = ownerIds.length > 0 ? holdersRepo.getById(ownerIds[0]) : null
  const personnummer = owner?.personnummer ?? null

  // 'reauth' = "waiting on BankID" in the existing stage vocabulary.
  // Reusing the closed union avoids touching the type in two places
  // (lib/sync/progress.ts + lib/queries.ts).
  const scrape = await scrapeHandelsbanken({
    personnummer,
    onStage: (s) => {
      if (s === 'launching' || s === 'awaiting-login') {
        setSyncProgress(connection.id, { stage: 'reauth' })
      } else if (s === 'capturing') {
        setSyncProgress(connection.id, { stage: 'fetching-accounts' })
      } else if (s === 'done') {
        setSyncProgress(connection.id, { stage: 'done' })
      }
    },
  })

  const dateFrom = opts.since.toISOString().slice(0, 10)
  const dateTo = opts.until.toISOString().slice(0, 10)
  const result = normalizeHandelsbanken(connection.id, scrape, { from: dateFrom, to: dateTo })

  // ISK cash sits inside the same account as the funds. For the
  // dashboard chart to show historical TOTAL value (and not undercount
  // by the cash amount), we pass the cash through to the NAV
  // backfiller as a constant additive — held flat across the lookback
  // window. Approximation, but cash usually doesn't change much
  // between syncs.
  const iskCashTotal = scrape.iskSummaries.reduce(
    (s, isk) => s + (isk.summary.availableAmount?.amount ?? 0),
    0,
  )

  // Best-effort backfill of per-date account value from Avanza fund
  // chart data. Silently skips when there's no linked Avanza
  // connection or any individual fund's lookup fails — we'd rather
  // ship today's snapshot than fail the whole sync over a missing
  // chart.
  try {
    const dailyValues = await fetchHbDailyValues(connection.id, result.positions ?? [], {
      constantCash: iskCashTotal,
    })
    if (dailyValues.length > 0) {
      result.dailyValues = dailyValues
    }
  } catch (e) {
    console.warn('[hb] NAV backfill failed:', (e as Error).message)
  }

  return result
}
