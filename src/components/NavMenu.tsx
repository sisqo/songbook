'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ThemePicker } from '@/components/ThemePicker'
import { IconBooks, IconImport, IconMenu, IconNote, IconSetlist } from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * The header's sections, behind one button.
 *
 * A menu rather than a row of links because the header is now on every screen,
 * including the reading page where horizontal space belongs to the song. Inside
 * the panel every entry carries its label, which the icon-only row on a phone
 * could not.
 *
 * Sign-out arrives as `children`: it is a server component wrapping a server
 * action, and passing it in is what lets this component be interactive without
 * turning that action into a client-side call.
 */
export function NavMenu({
  current,
  showSetlists,
  children,
}: {
  current: Section
  showSetlists: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Chiudi il menu' : 'Apri il menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={() => setOpen(false)} aria-hidden />

          <div className="menu-panel" role="menu">
            <Link href="/" className={item('canzoni')} role="menuitem" onClick={() => setOpen(false)}>
              <IconNote size={17} />
              Tutte le canzoni
            </Link>

            <Link
              href="/importa"
              className={item('importa')}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <IconImport size={17} />
              Importa
            </Link>

            <Link
              href="/canzonieri"
              className={item('canzonieri')}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <IconBooks size={17} />
              Canzonieri
            </Link>

            {showSetlists && (
              <Link
                href="/scalette"
                className={item('scalette')}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <IconSetlist size={17} />
                Scalette
              </Link>
            )}

            <div className="menu-divider" />

            {/*
              * Not a destination, so it does not close the menu: the reader is
              * looking at the thing they are changing, and the panel is part of it.
              */}
            <ThemePicker />

            <div className="menu-divider" />
            {children}
          </div>
        </>
      )}
    </div>
  )
}
