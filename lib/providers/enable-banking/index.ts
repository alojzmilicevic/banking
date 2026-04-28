import type { Provider } from '../types'
import { eb } from './api'
import { ebCompleteAuth, ebStartAuth } from './auth'
import { ebSync } from './sync'

export const enableBankingProvider: Provider = {
  id: 'enable-banking',
  name: 'Enable Banking',
  capabilities: { cash: true, cards: true },
  authFlows: ['redirect'],

  authFormSchema: () => [
    { name: 'aspspName', label: 'Bank', type: 'text', required: true },
    { name: 'aspspCountry', label: 'Country', type: 'text', required: true },
  ],

  listInstitutions: (country: string) => eb.listASPSPs(country),
  startAuth: ebStartAuth,
  completeAuth: ebCompleteAuth,
  sync: ebSync,
}

export { eb } from './api'
