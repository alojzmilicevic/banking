// Handelsbanken "auth" doesn't actually authenticate anything — there
// are no credentials to validate. We just create a connection row so
// the rest of the app (settings, sync button, dashboard) treats HB
// like any other linked bank. The real BankID step happens later,
// inside provider.sync(), when Playwright opens a Chrome window for
// the user.

import { randomUUID } from 'node:crypto'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as holdersRepo from '@/lib/repositories/holders'
import type { AuthChallenge, StartAuthInput } from '../types'

export async function hbStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  const holderIdRaw = input.input.holderId
  let holderId: string | null = null
  if (typeof holderIdRaw === 'string' && holderIdRaw.length > 0) {
    const h = holdersRepo.getById(holderIdRaw)
    if (h && h.userId === input.userId) holderId = h.id
  }

  // Re-link reuses the existing (user, hb, holder) row — same pattern
  // as Avanza, so adding HB twice under one holder doesn't duplicate.
  const existing = connectionsRepo.findIdByUserProviderAndHolder(
    input.userId,
    'handelsbanken',
    holderId,
  )

  const connectionId = existing ?? randomUUID()
  if (existing) {
    connectionsRepo.update(existing, {
      status: 'active',
      lastSyncError: null,
    })
  } else {
    connectionsRepo.createWithHolder(
      {
        id: connectionId,
        userId: input.userId,
        providerId: 'handelsbanken',
        externalId: `handelsbanken-${Date.now()}`,
        // 'Handelsbanken Fonder' (not bare 'Handelsbanken') so this row
        // is visually distinguishable from an EB-linked HB cash
        // connection — both can coexist under the same holder.
        label: 'Handelsbanken Fonder',
        validUntil: null, // session lifetime is per-sync (BankID), nothing to cache
        rawJson: null,
      },
      holderId,
    )
  }

  return { kind: 'complete', connectionId }
}
