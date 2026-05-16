// Playwright runner for Handelsbanken.
//
// HB has no API and no PSD2 fund-holdings exposure, so the only way to
// read the user's holdings is to observe the netbank doing it itself.
// We launch real Chrome (channel: 'chrome' — no Chromium download), the
// user does BankID, then we drive a sequence of navigations to capture:
//
//   1. holdings-overview         — master list of accounts (ISKs + FOND)
//   2. ISK summary  × N          — per-ISK fund holdings, keyed by
//                                  arPrimaryIdentifier from #1
//   3. directsavingfunds         — per-fund detail for the FOND side
//
// Each navigation triggers HB's own SPA XHRs, which we passively
// intercept. We never call HB's API directly — that would require
// reconstructing their x-shb-synchronized-token + bot-fingerprint
// dance. Letting the real frontend fire the calls is robust against
// future server-side changes.

import type {
  HbDirectSavingFundsResponse,
  HbHoldingsOverviewResponse,
  HbIskSummaryResponse,
  HbScrapeResult,
} from './types'

const FUNDS_PATH = '/splaa/spla/bu/customers/v3/me/directsavingfunds'
const OVERVIEW_PATH = '/splaa/spla/bu/investments/v1/own/holdings-overview'
const ISK_SUMMARY_PATH = '/splaa/spla/bu/investmentaccount/holding/isk/v1/summary'

// Deep link straight to BankID QR login — skips the public homepage +
// "Logga in" button hunt.
const LANDING_URL = 'https://secure.handelsbanken.se/logon/se/priv/sv/mbidqr/'
// Top-level "Spara och placera" overview — fires holdings-overview on mount.
const OVERVIEW_URL =
  'https://secure.handelsbanken.se/se/private/sv/savings_and_investments'
// ISK detail page; accountNumber == arPrimaryIdentifier from overview.
const iskPageUrl = (arPrimaryIdentifier: string) =>
  `https://secure.handelsbanken.se/se/private/sv/savings_and_investments/investment_savings_account/holdings?tab=holdings&accountNumber=${arPrimaryIdentifier}`
// Direct-fund-savings detail page; fires directsavingfunds on mount.
const FUNDS_URL =
  'https://secure.handelsbanken.se/se/private/sv/savings_and_investments/mutual_funds/holdings'
// Any URL under /se/private/ means the user has finished BankID and is
// now inside the netbank — our cue to begin the capture sequence.
const AUTHENTICATED_URL_RE = /secure\.handelsbanken\.se\/se\/private\//

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000 // user has 5min to BankID
const PER_PAGE_TIMEOUT_MS = 30_000 // each subsequent navigation step

// Account names (case-insensitive, exact match) we never want to
// capture — typically employer pension accounts whose funds aren't on
// Avanza, which would otherwise contribute to the household total
// without any tracking. The user explicitly opts out per account by
// name.
const IGNORED_ACCOUNT_NAMES = new Set(['pension'])

export interface ScrapeOptions {
  loginTimeoutMs?: number
  // Swedish personnummer (12 digits). Autofilled into HB's BankID
  // prompt when present so the user just hits Continue + signs on
  // their phone. When absent the user has to type it themselves.
  personnummer?: string | null
  // Hook for sync.ts to surface stages back to the UI's sync-progress
  // channel.
  onStage?: (stage: 'launching' | 'awaiting-login' | 'capturing' | 'done') => void
}

export async function scrapeHandelsbanken(opts: ScrapeOptions = {}): Promise<HbScrapeResult> {
  // Dynamic import: Playwright is only needed on the local machine
  // where this runs; keeping it out of the static graph means
  // production builds (and routes that never hit HB) don't pay the
  // import cost.
  const { chromium } = await import('playwright')

  opts.onStage?.('launching')

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // use user's installed Chrome — no separate Chromium download
  })

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    const authReady = waitForAuth(page, opts.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS)

    opts.onStage?.('awaiting-login')
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded' })

    // Dismiss the cookie consent banner if it shows up. Short timeout
    // since a previous-session cookie may already have it suppressed.
    await page
      .getByRole('button', { name: 'Godkänn alla', exact: true })
      .click({ timeout: 10_000 })
      .catch(() => {})

    // Autofill the BankID form so the user just confirms on their
    // phone. If we don't have a personnummer the user types it.
    if (opts.personnummer) {
      await page
        .getByLabel('Personnummer', { exact: true })
        .fill(opts.personnummer, { timeout: 10_000 })
      await page
        .getByRole('button', { name: 'Logga in', exact: true })
        .click({ timeout: 10_000 })
    }

    await authReady // resolves when user lands on /se/private/...

    opts.onStage?.('capturing')

    // Step 1: holdings-overview — drive the page to the savings hub.
    const overview = await captureXhr<HbHoldingsOverviewResponse>(
      page,
      OVERVIEW_PATH,
      () => page.goto(OVERVIEW_URL, { waitUntil: 'domcontentloaded' }),
      PER_PAGE_TIMEOUT_MS,
    ).catch(() => null)

    // Step 2: per-ISK summary. Iterate every holdingOverviews entry,
    // skipping accounts named in IGNORED_ACCOUNT_NAMES (e.g.
    // employer-pension funds we explicitly don't want in the
    // household total).
    const iskSummaries: HbIskSummaryResponse[] = []
    for (const isk of overview?.holdingOverviews ?? []) {
      if (IGNORED_ACCOUNT_NAMES.has(isk.accountName.trim().toLowerCase())) continue
      const summary = await captureXhr<HbIskSummaryResponse>(
        page,
        ISK_SUMMARY_PATH,
        () =>
          page.goto(iskPageUrl(isk.arPrimaryIdentifier), { waitUntil: 'domcontentloaded' }),
        PER_PAGE_TIMEOUT_MS,
      ).catch(() => null)
      if (summary) iskSummaries.push(summary)
    }

    // Step 3: direct fund savings (the FOND side). If the user only
    // has ISKs this navigation still works — the XHR just returns an
    // empty directSavingFundHoldings array.
    const directSavingFunds = await captureXhr<HbDirectSavingFundsResponse>(
      page,
      FUNDS_PATH,
      () => page.goto(FUNDS_URL, { waitUntil: 'domcontentloaded' }),
      PER_PAGE_TIMEOUT_MS,
    ).catch(() => null)

    opts.onStage?.('done')
    return { overview, iskSummaries, directSavingFunds }
  } finally {
    await browser.close().catch(() => {})
  }
}

// Resolves when the page navigates to an authenticated URL — our cue
// that BankID is complete. Rejects on timeout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function waitForAuth(page: any, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('framenavigated', onNav)
      reject(new Error('Timed out waiting for BankID — did you complete the sign-in?'))
    }, timeoutMs)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onNav = (frame: any) => {
      if (frame !== page.mainFrame()) return
      if (!AUTHENTICATED_URL_RE.test(frame.url())) return
      clearTimeout(timer)
      page.off('framenavigated', onNav)
      resolve()
    }
    page.on('framenavigated', onNav)
  })
}

// Drives `action` (typically a page.goto) and resolves with the first
// 200 JSON response whose URL contains `pathFragment`. The listener is
// attached before the action runs to avoid missing fast XHRs.
function captureXhr<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  pathFragment: string,
  action: () => Promise<unknown>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('response', onResponse)
      reject(new Error(`Timed out waiting for ${pathFragment}`))
    }, timeoutMs)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onResponse = async (response: any) => {
      const url: string = response.url()
      if (!url.includes(pathFragment)) return
      if (response.status() !== 200) return
      try {
        const body = (await response.json()) as T
        clearTimeout(timer)
        page.off('response', onResponse)
        resolve(body)
      } catch (e) {
        clearTimeout(timer)
        page.off('response', onResponse)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    page.on('response', onResponse)

    action().catch(() => {
      // page.goto failures are fine — if the navigation cancels we
      // either still get the XHR (race-friendly) or time out.
    })
  })
}
