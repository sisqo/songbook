import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { IconNote } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'

/**
 * The header on every page that is not `TopBar`'s to draw: login, register, the password
 * recovery pair, email verification, pricing, and the four legal pages — everywhere a reader
 * may be signed out, or never signs in at all. Same bar, same brand mark, as `TopBar`'s own
 * (`.top-bar`/`.top-bar-inner`/`.brand`/`.brand-mark`, reused rather than redrawn), so the one
 * thing that changes between "inside" and "outside" the app is what sits on the right of it:
 * a menu built for a signed-in reader there, only the theme switch here — the one control
 * every page needs regardless of who is reading it, which is why it is the one thing this
 * header exists to hold.
 *
 * The brand mark is the way back to `/` — for the legal pages this replaces the bespoke
 * «← Songbook» link `(legal)/layout.tsx` used to draw inline, and for `/pricing` the inline
 * one that sat above its own heading; a second way home directly under this bar would only
 * repeat what the header already says.
 */
export function PublicHeader() {
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <Link href="/" className="brand" aria-label={`${APP_NAME}, home`}>
          <span className="brand-mark">
            <IconNote size={15} />
          </span>
          <span>{APP_NAME}</span>
        </Link>

        <span className="flex-1" />

        <ThemeToggle />
      </div>
    </header>
  )
}
