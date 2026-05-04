'use client'
// Last-resort boundary used when the root layout itself throws. Must
// render its own <html>/<body> per Next.js' contract.
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background p-8 font-sans text-foreground">
        <h1 className="mb-3 text-24 font-medium">Banking — fatal error</h1>
        <p className="text-neg">{error.message || 'Unknown error'}</p>
        {error.digest && <p className="text-12 text-text-faint">digest: {error.digest}</p>}
        <button
          onClick={reset}
          className="mt-4 cursor-pointer rounded-6 border border-border-strong bg-overlay px-3.5 py-2 text-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  )
}
