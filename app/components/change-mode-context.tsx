// Ambient setting: render change pills as absolute value (kr) or
// percentage (%). Drilling this through every layer (HomeContent →
// Sidebar → PersonSection → SidebarAccountRow, plus MobileLayout's
// inner row component, plus SummaryCards, plus Topbar) would touch
// every component signature for what's effectively a UI preference,
// so it lives in Context instead.

'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ChangeMode } from './ChangeModeToggle'

const ChangeModeContext = createContext<ChangeMode>('abs')

export function ChangeModeProvider({
  value,
  children,
}: {
  value: ChangeMode
  children: ReactNode
}) {
  return <ChangeModeContext.Provider value={value}>{children}</ChangeModeContext.Provider>
}

export function useChangeMode(): ChangeMode {
  return useContext(ChangeModeContext)
}
