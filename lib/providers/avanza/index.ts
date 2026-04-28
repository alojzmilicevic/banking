import type { Provider } from '../types'
import { avanzaStartAuth } from './auth'
import { avanzaSync } from './sync'

export const avanzaProvider: Provider = {
  id: 'avanza',
  name: 'Avanza',
  capabilities: { cash: true, investments: true, pensions: true },
  authFlows: ['cookies'],

  authFormSchema: (flow) => {
    if (flow === 'cookies') {
      return [
        {
          name: 'cookies',
          label: 'Cookie header from your logged-in browser',
          type: 'text',
          placeholder: 'csid=...; cstoken=...; AZAHLI=...',
          required: true,
        },
      ]
    }
    return []
  },

  startAuth: avanzaStartAuth,
  sync: avanzaSync,
}
