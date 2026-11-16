import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'

interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  onAnswer: (confirmed: boolean) => void
}

function ConfirmDialog({ message, confirmLabel, onAnswer }: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)
  const accept = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancel.current?.focus()
    // Caught first, so a panel underneath neither closes with Escape nor takes the focus back.
    function onKeyDown(event: KeyboardEvent) {
      event.stopPropagation()
      if (event.key === 'Escape') onAnswer(false)
      if (event.key === 'Tab') {
        event.preventDefault()
        ;(document.activeElement === cancel.current ? accept : cancel).current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onAnswer])

  return (
    <div className="panel-backdrop confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onAnswer(false) }}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Confirmación" aria-describedby="confirm-message">
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button ref={cancel} className="button button-outline" type="button" onClick={() => onAnswer(false)}>Cancelar</button>
          <button ref={accept} className="button button-danger" type="button" onClick={() => onAnswer(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Asks before something that cannot be undone. Replaces window.confirm, which some browsers and embedded views answer
 * with «no» without showing anything, so the action silently did nothing.
 */
export function askConfirm(message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(<ConfirmDialog message={message} confirmLabel={confirmLabel} onAnswer={(confirmed) => {
      root.unmount()
      host.remove()
      if (previousFocus?.isConnected) previousFocus.focus()
      resolve(confirmed)
    }} />)
  })
}
