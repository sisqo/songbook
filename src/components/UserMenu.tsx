'use client'

import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { IconChevronLeft, IconKey, IconTrash } from '@/components/icons'
import { deleteMyAccount } from '@/lib/accounts/actions'
import { SELF_DELETE_MESSAGE } from '@/lib/accounts/types'
import { avatarColorIndex, avatarInitials } from '@/lib/avatar'
import { PLAN_LABEL } from '@/lib/plans/types'

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
  const { email, known, isGlobalOwner, plan } = useRole()
  const [open, setOpen] = useState(false)
  /** A second screen inside the same panel, same pattern as Settings in `NavMenu`. */
  const [view, setView] = useState<'main' | 'delete'>('main')

  const close = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (view !== 'main') setView('main')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view])

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
            {view === 'main' && (
              <>
                <div className="user-menu-header">
                  <span className="avatar avatar-lg" style={{ background: `var(--avatar-${colorIndex})` }}>
                    {initials}
                  </span>
                  <div className="user-menu-identity">
                    <span className="user-menu-email">{email}</span>
                    {/*
                      * `plan` is null while unknown and null forever with the plans switched
                      * off (see `RoleContextValue`'s own comment) — both read the same as
                      * "nothing to say here", same as the Owner badge beside it being absent
                      * for anybody who isn't one.
                      */}
                    {plan !== null && <span className="badge mt-1">{PLAN_LABEL[plan]}</span>}
                    {isGlobalOwner && <span className="badge mt-1">Owner</span>}
                  </div>
                </div>

                <div className="menu-divider" />

                <Link href="/password" className="menu-item" role="menuitem" onClick={close}>
                  <IconKey size={17} />
                  Change password
                </Link>

                {children}

                <div className="menu-divider" />

                {/*
                 * Last row, past the divider that already separates it from Sign out:
                 * every reader has this over their own account, own-owner or not — see
                 * `deleteMyAccount`'s own comment on why it is a different power from
                 * the one `/accounts` gives a global owner over every account.
                 */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  onClick={() => setView('delete')}
                >
                  <IconTrash size={17} />
                  Delete account
                </button>
              </>
            )}

            {view === 'delete' && <DeleteMyAccountView email={email} onBack={() => setView('main')} />}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The retype-to-confirm safety net, same shape as `DeleteAccountButton`'s own — the
 * one difference being what happens on success: that button refreshes a list still on
 * screen, this one has nothing left to show, since `deleteMyAccount` ends by signing
 * the reader out and redirecting to `/login` on its own.
 */
function DeleteMyAccountView({ email, onBack }: { email: string; onBack: () => void }) {
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase()

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteMyAccount(confirmEmail)
      // A failure comes back as a normal result; success never does — deleteMyAccount
      // ends in a redirect instead, which unwinds through this same call as a thrown
      // signal rather than a return, so there is nothing to do here on that path.
      if (!result.ok) setError(SELF_DELETE_MESSAGE[result.reason])
    } catch (thrown) {
      // `deleteMyAccount`'s own redirect unwinds through this same call as a thrown
      // signal, same as `signIn`'s in `login/page.tsx` — it has to pass through
      // untouched, so only a real failure ever reaches `setError` below.
      unstable_rethrow(thrown)
      setError(SELF_DELETE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="menu-item w-full" role="menuitem" aria-label="Back to the menu" onClick={onBack}>
        <IconChevronLeft size={17} />
        Delete account
      </button>

      <div className="menu-divider" />

      <div className="px-1.5 pb-1 pt-1">
        <p className="text-sm text-muted">
          This permanently deletes your account and everything in it — every songbook,
          section and song — and signs you out. Type <strong>{email}</strong> to confirm.
        </p>

        <input
          autoFocus
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={email}
          aria-label={`Retype ${email} to confirm deletion`}
          className="form-field mt-3"
        />

        {error !== null && (
          <p className="notice notice-error mt-2.5" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn btn-danger btn-sm mt-3 w-full"
          disabled={!matches || busy}
          onClick={() => void confirm()}
        >
          Delete my account
        </button>
      </div>
    </>
  )
}
