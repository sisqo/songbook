'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { InstrumentPicker } from '@/components/InstrumentPicker'
import { useRole } from '@/components/RoleProvider'
import { ThemePicker } from '@/components/ThemePicker'
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternal,
  IconKey,
  IconMenu,
  IconNote,
  IconSettings,
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
 * One entry depends on what the reader may do, and it is absent until the answer
 * arrives rather than present and refusing. A viewer's menu is therefore the songs,
 * the tuner, and how they like to read — which is everything a viewer has.
 *
 * Settings is a second screen inside the same panel rather than a page of its own:
 * changing the theme or the instrument is something a reader does mid-song, and a
 * real navigation would cost them the page they were reading to get there and again
 * to get back. `view` resets to `main` on every close, so the panel always opens
 * where it left off closing — at the top, not wherever Settings happened to leave it.
 */
export function NavMenu({
  current,
  children,
}: {
  current: Section
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'settings'>('main')
  const { mayManageUsers } = useRole()

  const close = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (view === 'settings') setView('main')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view])

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => {
          setOpen((value) => !value)
          setView('main')
        }}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel" role="menu">
            {view === 'settings' ? (
              <>
                {/*
                  * Its own row rather than a header: on a phone this is still a tap
                  * target. The label reads "Settings" either way, so the accessible
                  * name says what the tap actually does — a screen reader has no
                  * chevron to tell this apart from the row that opens this view.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Settings
                </button>

                <div className="menu-divider" />

                {/*
                  * Every role has one of these: how you get in is your own business, and
                  * a viewer needs it as much as an admin.
                  */}
                <Link href="/password" className={item('password')} role="menuitem" onClick={close}>
                  <IconKey size={17} />
                  Password
                </Link>

                {/*
                  * Neither is a destination, so neither closes the menu: the reader is
                  * looking at the thing they are changing, and the panel is part of it.
                  */}
                <InstrumentPicker />
                <ThemePicker />
              </>
            ) : (
              <>
                <Link href="/" className={item('songs')} role="menuitem" onClick={close}>
                  <IconNote size={17} />
                  Home
                </Link>

                {mayManageUsers && (
                  <Link href="/users" className={item('users')} role="menuitem" onClick={close}>
                    <IconUsers size={17} />
                    Users
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
                  onClick={close}
                >
                  <IconTuningFork size={17} />
                  Tuner
                  <span className="sr-only">(opens in a new tab)</span>
                  <IconExternal size={13} className="ms-auto" />
                </a>

                <div className="menu-divider" />

                {/*
                  * A second screen rather than a destination, so it does not close the
                  * panel — the chevron says as much, the same way the tuner's arrow says
                  * the opposite. Last before sign-out and behind its own divider: nothing
                  * here touches the repertoire, only this reader's own account and screen.
                  */}
                <button
                  type="button"
                  className={current === 'password' ? 'menu-item is-on w-full' : 'menu-item w-full'}
                  role="menuitem"
                  aria-label="Settings, opens the settings list"
                  onClick={() => setView('settings')}
                >
                  <IconSettings size={17} />
                  Settings
                  <IconChevronRight size={15} className="ms-auto" />
                </button>

                <div className="menu-divider" />
                {children}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
