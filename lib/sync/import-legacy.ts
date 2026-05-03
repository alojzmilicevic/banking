// One-shot import: pulls data/state.json (the old JSON store) into SQLite.
// Idempotent — checked by presence of any users in the DB.

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { accounts, connections, users } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'

const LEGACY_FILE = path.join(process.cwd(), 'data', 'state.json')

interface LegacySession {
  session_id: string
  state: string
  aspsp_name: string
  aspsp_country: string
  valid_until: string
  created_at: number
  accounts: LegacyAccount[]
}

interface LegacyAccount {
  uid: string
  name?: string | null
  details?: string | null
  product?: string | null
  cash_account_type?: string | null
  currency?: string | null
  account_id?: { iban?: string | null; bban?: string | null; other?: { identification: string } | null } | null
  account_servicer?: { bic_fi?: string | null } | null
}

interface LegacyState {
  sessions?: LegacySession[]
}

export function importLegacyIfPresent(
  db: BetterSQLite3Database<typeof schema>,
): { imported: boolean; userId?: string; connections?: number; accounts?: number } {
  if (!fs.existsSync(LEGACY_FILE)) return { imported: false }

  const existingUsers = db.select().from(users).all()
  if (existingUsers.length > 0) return { imported: false }

  let parsed: LegacyState
  try {
    parsed = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')) as LegacyState
  } catch {
    return { imported: false }
  }
  if (!parsed.sessions?.length) return { imported: false }

  const userId = randomUUID()
  let connectionCount = 0
  let accountCount = 0

  db.transaction((tx) => {
    tx.insert(users).values({ id: userId, name: 'Household' }).run()

    for (const s of parsed.sessions!) {
      const connId = randomUUID()
      tx.insert(connections)
        .values({
          id: connId,
          userId,
          providerId: 'enable-banking',
          externalId: s.session_id,
          label: `${s.aspsp_name} (${s.aspsp_country})`,
          status: 'active',
          validUntil: s.valid_until ? new Date(s.valid_until).getTime() : null,
          rawJson: JSON.stringify({ aspsp_name: s.aspsp_name, aspsp_country: s.aspsp_country }),
          createdAt: s.created_at ?? Date.now(),
        })
        .run()
      connectionCount++

      for (const a of s.accounts ?? []) {
        tx.insert(accounts)
          .values({
            id: a.uid,
            connectionId: connId,
            name: a.name ?? null,
            details: a.details ?? null,
            product: a.product ?? null,
            accountType: a.cash_account_type ?? null,
            currency: a.currency ?? null,
            iban: a.account_id?.iban ?? null,
            bban: a.account_id?.bban ?? a.account_id?.other?.identification ?? null,
            bic: a.account_servicer?.bic_fi ?? null,
          })
          .run()
        accountCount++
      }
    }
  })

  // Rename the legacy file so future boots don't try again, but keep it as
  // a backup for debugging.
  try {
    fs.renameSync(LEGACY_FILE, `${LEGACY_FILE}.imported`)
  } catch {
    /* ignore */
  }

  return { imported: true, userId, connections: connectionCount, accounts: accountCount }
}
