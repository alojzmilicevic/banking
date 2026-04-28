import type { Provider } from '../types'
import { eb } from './api'
import { ebCompleteAuth, ebStartAuth } from './auth'
import { ebSync } from './sync'

export const enableBankingProvider: Provider = {
  id: 'enable-banking',
  name: 'Enable Banking',

  listInstitutions: (country: string) => eb.listASPSPs(country),
  startAuth: ebStartAuth,
  completeAuth: ebCompleteAuth,
  sync: ebSync,
}

export { eb } from './api'
