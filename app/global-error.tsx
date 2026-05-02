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
      <body
        style={{
          padding: '32px',
          fontFamily: 'system-ui, sans-serif',
          background: '#0c0e11',
          color: '#e6e6e6',
        }}
      >
        <h1 style={{ fontSize: '1.4rem', marginBottom: '12px' }}>Banking — fatal error</h1>
        <p style={{ color: '#ff6e6e' }}>{error.message || 'Unknown error'}</p>
        {error.digest && (
          <p style={{ color: '#888', fontSize: '0.8rem' }}>digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: '16px',
            padding: '8px 14px',
            background: '#1f242a',
            color: '#e6e6e6',
            border: '1px solid #2a2f36',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
