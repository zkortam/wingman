'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { KeyHint } from './KeyHint'

const links = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/outcomes', label: 'Outcomes' },
  { href: '/config', label: 'Config' },
  { href: '/settings', label: 'Settings' },
]

const shortcuts = [
  ['j / k', 'Move down / up'],
  ['enter', 'Open incident'],
  ['a', 'Apply'],
  ['x', 'Dismiss'],
  ['e', 'Expand evidence'],
  ['[ / ]', 'Previous / next'],
  ['c', 'Copy incident id'],
  ['g i', 'Inbox'],
  ['g o', 'Outcomes'],
  ['g c', 'Config'],
  ['g s', 'Settings'],
]

export const Rail = () => {
  const pathname = usePathname()
  const router = useRouter()
  const pendingGo = useRef(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : ''
  }, [theme])

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return
      if (event.key === '?') {
        setShowShortcuts((visible) => !visible)
      }
      if (event.key === 'Escape') setShowShortcuts(false)
      if (pendingGo.current) {
        pendingGo.current = false
        const destination = { i: '/inbox', o: '/outcomes', c: '/config', s: '/settings' }[event.key]
        if (destination) router.push(destination)
        return
      }
      if (event.key === 'g') pendingGo.current = true
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [router])

  return (
    <aside className="rail">
      <div className="rail-brand">Wingman</div>
      <nav className="rail-nav" aria-label="Primary navigation">
        {links.map((link) => (
          <Link
            className="rail-link"
            data-active={pathname.startsWith(link.href)}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="rail-footer">
        <button
          className="theme-button"
          onClick={() => setShowShortcuts((visible) => !visible)}
          type="button"
        >
          <KeyHint keys={['?']} /> keys
        </button>
        <button
          aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
          className="theme-button mono"
          onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
          type="button"
        >
          {theme === 'light' ? 'dark' : 'light'}
        </button>
      </div>
      {showShortcuts ? (
        <div className="shortcut-sheet" aria-label="Keyboard shortcuts">
          {shortcuts.map(([keys, action]) => (
            <div className="shortcut-row" key={keys}>
              <KeyHint keys={[keys ?? '']} />
              <span>{action}</span>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  )
}
