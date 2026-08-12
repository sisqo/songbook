'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { InstrumentPicker } from '@/components/InstrumentPicker'
import { useRole } from '@/components/RoleProvider'
import { ThemePicker } from '@/components/ThemePicker'
import {
  IconBooks,
  IconExternal,
  IconImport,
  IconMenu,
  IconNote,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import type { Section } from '@/components/TopBar'

/** The tuner, which is a separate app on its own domain. */
const TUNER_URL = 'https://guitar.sisqo.dev'

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
 *
 * Three of the entries depend on what the reader may do, and they are absent until the
 * answer arrives rather than present and refusing. A viewer's menu is therefore the
 * songs, the tuner, and how they like to read — which is everything a viewer has.
 */
export function NavMenu({
  current,
  children,
}: {
  current: Section
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { mayEdit, mayManageUsers } = useRole()

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

            {mayEdit && (
              <>
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
              </>
            )}

            {mayManageUsers && (
              <Link
                href="/utenti"
                className={item('utenti')}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <IconUsers size={17} />
                Utenti
              </Link>
            )}

            {/*
              * The tuner, which is another app on another domain.
              *
              * It sits with the sections rather than in a group of its own: from
              * here it is one more place to go, and a fourth divider would make the
              * menu look like four unrelated things. The arrow at the end is what
              * says it leaves — and, by saying that, that it needs a network, which
              * nothing else in this menu does.
              *
              * A plain anchor, in a new tab: the reader is in the middle of a song,
              * and tuning should not cost them the page they were reading.
              */}
            <a
              href={TUNER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <IconTuningFork size={17} />
              Accordatore
              <span className="sr-only">(si apre in una nuova scheda)</span>
              <IconExternal size={13} className="ms-auto" />
            </a>

            <div className="menu-divider" />

            {/*
              * Neither is a destination, so neither closes the menu: the reader is
              * looking at the thing they are changing, and the panel is part of it.
              */}
            <InstrumentPicker />
            <ThemePicker />

            <div className="menu-divider" />
            {children}
          </div>
        </>
      )}
    </div>
  )
}
