// Account detail service — composes the repos for the /account/[id] page.

import * as accountsRepo from '@/lib/repositories/accounts'
import * as balancesRepo from '@/lib/repositories/balances'
import * as connectionsRepo from '@/lib/repositories/connections'
import * as transactionsRepo from '@/lib/repositories/transactions'
import type { Account, Balance, Connection, Transaction } from '@/lib/db/schema'

export interface AccountDetails {
  account: Account
  connection: Connection | null
  balances: Balance[]
  transactions: Transaction[]
}

export function getAccountDetails(id: string): AccountDetails | null {
  const account = accountsRepo.getById(id)
  if (!account) return null

  return {
    account,
    connection: connectionsRepo.getById(account.connectionId),
    balances: balancesRepo.listByAccountId(id),
    transactions: transactionsRepo.listByAccountId(id),
  }
}
