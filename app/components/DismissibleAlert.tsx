import { Alert } from '@/components/ui/alert'

export function DismissibleAlert({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <Alert>
      <button
        type="button"
        className="float-right -mr-1 -mt-0.5 text-xs opacity-60 hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
      {message}
    </Alert>
  )
}
