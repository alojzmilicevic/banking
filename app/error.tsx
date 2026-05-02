'use client'
// Route-segment error boundary. Renders when a server component throws or a
// child client component bubbles an unhandled exception.
import { useEffect } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <main className="mx-auto max-w-[960px] px-6 pb-16 pt-8">
      <Card>
        <CardTitle>Something went wrong</CardTitle>
        <Alert className="mt-3">{error.message || 'Unknown error'}</Alert>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">digest: {error.digest}</p>
        )}
        <div className="mt-4">
          <Button onClick={reset}>Try again</Button>
        </div>
      </Card>
    </main>
  )
}
