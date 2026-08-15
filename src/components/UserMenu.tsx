'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { IconKey } from '@/components/icons'
import { avatarColorIndex, avatarInitials } from '@/lib/avatar'

/**
 * The reader's own identity, next to the hamburger (v3.3) — who is signed in, and
 * the two things that are about *being signed in* rather than about the app: change
 * password and sign out. Both used to live inside the hamburger (Password behind
 * Settings, Sign out at the very end); they moved here so the hamburger holds only
 * navigation, and this holds only the reader's own account, with nothing duplicated
 * between the two.
 *
 * The avatar reads the email, not the Google profile, even though a Google sign-in
 * carries a name and a picture this app could ask for: a credentials account
 * (v3.2) has neither, and an avatar that looks like a photo for some readers and a
 * monogram for others would read as two different features rather than one. The
 * email is the one identity fact every reader has, whichever way they signed in.
 *
 * Hidden entirely until the identity is known, same as the Accounts link in
 * `NavMenu`: a control that flashes in a moment late is a control that was simply
 * not there yet, not one that has already been reached for.
 *
 * Sign-out arrives as `children`, not an import: it is a server component
 * wrapping an inline server action, and this is a client component — Next.js
 * refuses to bundle the two directly together, the same reason `NavMenu` used to
 * take it this way before sign-out moved here (see its own history).
 */
export function UserMenu({ children }: { children: React.ReactNode }) {
  const { email, known, isGlobalOwner } = useRole()
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

  if (!known || email === null) return null

  const initials = avatarInitials(email)
  const colorIndex = avatarColorIndex(email)

  return (
    <div className="menu">
      <button
        type="button"
        className="avatar-button"
        style={{ background: `var(--avatar-${colorIndex})` }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close your account menu' : 'Open your account menu'}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel" role="menu">
            <div className="user-menu-header">
              <span className="avatar avatar-lg" style={{ background: `var(--avatar-${colorIndex})` }}>
                {initials}
              </span>
              <div className="user-menu-identity">
                <span className="user-menu-email">{email}</span>
                {isGlobalOwner && <span className="badge mt-1">Owner</span>}
              </div>
            </div>

            <div className="menu-divider" />

            <Link href="/password" className="menu-item" role="menuitem" onClick={close}>
              <IconKey size={17} />
              Change password
            </Link>

            {children}
          </div>
        </>
      )}
    </div>
  )
}
