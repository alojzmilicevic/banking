import type { Provider } from '../types'
import { hbStartAuth } from './auth'
import { hbSync } from './sync'

export const handelsbankenProvider: Provider = {
  id: 'handelsbanken',
  name: 'Handelsbanken',
  capabilities: { investments: true },
  // Reused 'credentials' here because Provider.authFlows is a closed
  // union and HB has no real flow — clicking "Connect HB" just
  // creates the row, BankID happens later inside sync().
  authFlows: ['credentials'],

  authFormSchema: () => [],

  startAuth: hbStartAuth,
  sync: hbSync,
}
