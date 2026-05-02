'use client'
// Dashboard layout: hero stat → chart → account tiles. The "+" button
// (top-right, near the title) opens a single modal that handles both
// providers — no more multi-step disclosure dance.

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import Accounts from './components/Accounts'
import AddBankModal from './components/AddBankModal'
import Timeline, { type TimelineSnapshot } from './components/Timeline'
import WealthHero from './components/WealthHero'
import { type Period } from './components/PeriodTabs'
import { Alert } from '@/components/ui/alert'
import { useSyncAll, type Holder } from '@/lib/queries'
import { celebrate } from '@/lib/animation/confetti'

type LinkerHolder = Exclude<Holder, 'joint'>

export default function HomeContent({ initialError }: { initialError: string | null }) {
  const [period, setPeriod] = useState<Period>('1Y')
  const [pageError, setPageError] = useState<string | null>(initialError)
  const [snap, setSnap] = useState<TimelineSnapshot>({
    total: null,
    currency: null,
    changeAbsolute: null,
    changePct: null,
  })
  const [addOpen, setAddOpen] = useState(false)
  const [addHolder, setAddHolder] = useState<LinkerHolder | undefined>(undefined)

  function openAdd(h?: LinkerHolder) {
    setAddHolder(h)
    setAddOpen(true)
  }

  const syncAll = useSyncAll()

  // Fire confetti once if we just landed from a successful OAuth callback.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('connected')) {
      celebrate()
      const url = new URL(window.location.href)
      url.searchParams.delete('connected')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  return (
    <main className="mx-auto max-w-[1100px] px-5 pb-16 pt-6 sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <motion.h1
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="text-[1.4rem] font-semibold tracking-tight"
        >
          Banking<span className="text-primary">.</span>
        </motion.h1>
        <motion.button
          type="button"
          onClick={() => openAdd()}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          Add bank
        </motion.button>
      </header>

      {pageError && (
        <Alert className="mb-4">
          <button
            type="button"
            className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
            onClick={() => setPageError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
          {pageError}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <WealthHero
          total={snap.total}
          currency={snap.currency}
          changeAbsolute={snap.changeAbsolute}
          changePct={snap.changePct}
          period={period}
          syncing={syncAll.isPending}
          onSync={() => syncAll.mutate()}
          isLoading={snap.total == null && !syncAll.isPending}
        />
        <Timeline period={period} onPeriodChange={setPeriod} onSnapshotChange={setSnap} />
      </div>

      <div className="mt-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Accounts
        </h2>
        <Accounts onAddBank={openAdd} />
      </div>

      <AddBankModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConnected={() => celebrate()}
        initialHolder={addHolder}
      />
    </main>
  )
}
