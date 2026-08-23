'use client'

import { useEffect, useRef } from 'react'

interface ConfirmProps {
  title: string
  body: string
  destructive?: boolean
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export const Confirm = ({ title, body, destructive = false, pending = false, onCancel, onConfirm }: ConfirmProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !pending) onCancel()
      if (event.key !== 'Tab') return
      const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
      previousFocus?.focus()
    }
  }, [onCancel, pending])

  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pending && onCancel()}>
      <section aria-describedby="confirm-body" aria-labelledby="confirm-title" aria-modal="true" className="confirm-panel" ref={panelRef} role="dialog">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button disabled={pending} onClick={onCancel} ref={cancelRef} type="button">Cancel</button>
          <button className={destructive ? 'danger-button' : 'primary-button'} disabled={pending} onClick={onConfirm} type="button">
            {pending ? 'Working' : 'Confirm'}
          </button>
        </div>
      </section>
    </div>
  )
}
