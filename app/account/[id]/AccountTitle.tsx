'use client'

// Editable account title. Click the title (or the pencil) to swap into an
// input; Enter saves, Escape cancels. Empty input clears the alias and
// falls back to the provider's raw name.
//
// Lives next to the page since it's the only consumer — the rename action
// is local to the account detail view.

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, RotateCcw, X } from 'lucide-react'
import { useSetAccountAlias } from '@/lib/queries'
import { cn } from '@/lib/utils'

export function AccountTitle({
  accountId,
  initialAlias,
  providerLabel,
}: {
  accountId: string
  initialAlias: string | null
  // What `accountLabel` resolves to when alias is null — shown below the
  // editable title when an alias is in effect, so the user can see what
  // the bank calls this account.
  providerLabel: string
}) {
  const [alias, setAlias] = useState<string | null>(initialAlias)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(alias ?? providerLabel)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const setAccountAlias = useSetAccountAlias()

  // Snap selection to the end when the input mounts so users can append
  // without first moving the caret.
  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const displayed = alias ?? providerLabel

  async function save(value: string) {
    const next = value.trim()
    setError(null)
    try {
      // Empty string clears the alias server-side; track that locally.
      await setAccountAlias.mutateAsync({ id: accountId, alias: next })
      setAlias(next.length === 0 ? null : next)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function cancel() {
    setDraft(alias ?? providerLabel)
    setError(null)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save(draft)
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              }
            }}
            maxLength={100}
            disabled={setAccountAlias.isPending}
            placeholder={providerLabel}
            className="min-w-0 flex-1 rounded-md border border-input-border bg-card px-3 py-1.5 text-24 font-semibold text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Account name"
          />
          <button
            type="submit"
            disabled={setAccountAlias.isPending}
            aria-label="Save name"
            title="Save (Enter)"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
          >
            {setAccountAlias.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={setAccountAlias.isPending}
            aria-label="Cancel rename"
            title="Cancel (Esc)"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-input-border bg-secondary text-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="size-4" />
          </button>
        </form>
        {error && (
          <p className="mt-1.5 text-12 text-neg" role="alert">
            {error}
          </p>
        )}
        <p className="mt-1.5 text-12 text-text-faint">
          Empty input clears the rename and shows the bank&apos;s label ({providerLabel}).
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <div className="group flex items-center gap-2">
        <h1
          className={cn(
            'cursor-pointer text-24 font-semibold transition-colors hover:text-text-faint',
          )}
          onClick={() => setEditing(true)}
          title="Click to rename"
        >
          {displayed}
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename account"
          title="Rename"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-faint opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      {alias !== null && (
        <button
          type="button"
          onClick={() => void save('')}
          disabled={setAccountAlias.isPending}
          className="mt-1 inline-flex items-center gap-1 text-12 text-text-faint transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          title="Reset to the bank's label"
        >
          <RotateCcw className="size-3" />
          Bank label: {providerLabel} · reset
        </button>
      )}
    </div>
  )
}
