'use client'

import { useEffect, useState } from 'react'

import { InstrumentPicker } from '@/components/InstrumentPicker'
import { ThemePicker } from '@/components/ThemePicker'
import { IconChevronLeft, IconMenu } from '@/components/icons'

/**
 * The one thing a guest following a Sing Together link may change about how they read:
 * the theme, and which instrument the chord diagrams are drawn for. Neither is about the
 * broadcast or the repertoire — both are how *this one screen* looks, which is exactly
 * why a guest, who has no account and no session, is still allowed to touch them.
 *
 * This is not `NavMenu` with items hidden. Home, Users, the tuner, Sing Together,
 * Password, sign-out — every one of them is either meaningless with no session or not
 * this screen's to give, and threading a "guest mode" through a component built for a
 * signed-in reader's menu would mean every future addition to it has to remember this
 * exists too. A menu with exactly two rows is simpler built on its own.
 *
 * `InstrumentPicker` still needs a `PrefsProvider` above it — see `FollowSession`'s own
 * top-level one, which this shares with whichever song is currently on screen, so a
 * change here shows up there without a round trip.
 */
export function GuestSettingsMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close settings' : 'Open settings'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={() => setOpen(false)} aria-hidden />

          <div className="menu-panel" role="menu">
            {/*
              * Closes the panel rather than leading back to a main screen this menu does
              * not have — same row, same label as the real Settings' own back-row, so it
              * still reads as the same place, just with nowhere behind it to go to.
              */}
            <button
              type="button"
              className="menu-item w-full"
              role="menuitem"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
            >
              <IconChevronLeft size={17} />
              Settings
            </button>

            <div className="menu-divider" />

            <InstrumentPicker />
            <ThemePicker />
          </div>
        </>
      )}
    </div>
  )
}
