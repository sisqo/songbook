'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { IconEye, IconShield, IconSwitchAccount } from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * Everything that is about running the installation rather than about reading from it —
 * behind one icon of its own in the header, offered only to a global owner.
 *
 * It exists so the other two menus can stop being conditional. Accounts and Emails used to
 * sit in `NavMenu` behind an `isGlobalOwner` test, and the user menu carried an "Owner"
 * badge nobody else saw, which meant the two menus every reader uses were quietly a
 * different shape for one reader. They are now identical for everybody, owner included, and
 * the difference lives here instead: a third opener that is either present or absent, which
 * is a far easier thing to reason about than two panels with holes in them.
 *
 * Absent — not disabled, and not present-and-refusing — for anyone who is not a global
 * owner, and absent until the answer arrives at all: `isGlobalOwner` is false while
 * `RoleProvider` is still asking, so this draws nothing until it is known to be wanted. That
 * is the same rule `RoleProvider`'s own comment sets out and the same one the Accounts entry
 * followed before it moved here — a control that flashes in a moment late is a control
 * somebody has already reached for.
 *
 * Not a permission. `/accounts` and `/emails` each re-check `isOwner` on the server and
 * `notFound()` on their own; hiding the way in is a courtesy to everyone else, never the
 * fence.
 *
 * `is-compact` on the panel is load-bearing rather than cosmetic — see that rule's own
 * comment in `globals.css`: this is the one panel in the bar whose trigger has other buttons
 * to its right, so at the base width its left edge landed exactly on the viewport's own.
 *
 * Two plain links rather than a table of entries to map over: there are two, and `PLAN.md`
 * will say when there is a third. A list of two is not a list yet.
 */
export function AdminMenu({ current }: { current: Section }) {
  const { isGlobalOwner } = useRole()
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!isGlobalOwner) return null

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <div className="menu">
      <button
        type="button"
        /*
         * `is-on` while the reader is *on* one of these screens, the same tell `.menu-item`
         * carries inside every panel. It matters more here than it would on another opener:
         * with Accounts and Emails out of the hamburger, nothing else in the bar says which
         * section an admin page belongs to any more.
         */
        className={current === 'accounts' || current === 'emails' ? 'nav-link is-on' : 'nav-link'}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the admin menu' : 'Open the admin menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconShield size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind" — same overlay the other two panels use. */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel is-compact" role="menu">
            <Link href="/accounts" className={item('accounts')} role="menuitem" onClick={close}>
              <IconSwitchAccount size={17} />
              Accounts
            </Link>

            <Link href="/emails" className={item('emails')} role="menuitem" onClick={close}>
              <IconEye size={17} />
              Emails
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
