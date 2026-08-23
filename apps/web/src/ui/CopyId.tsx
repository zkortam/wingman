'use client'

import { useEffect, useState } from 'react'

export const CopyId = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 120)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(id)
    setCopied(true)
  }

  return <button className="copy-id" data-copied={copied} onClick={copy} type="button">{id}</button>
}
