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
 * `width` sets `--top-bar-width`, the same variable `.top-bar-inner` reads for `TopBar`'s own
 * `max-w-3xl`/48rem default. Every page this renders on is a different shape from every other
 * — a 70rem landing page, a 42rem legal document, a 24rem sign-in card — and a header with one
 * borrowed width would line its brand mark and its theme switch up with nothing on most of
 * them. There is no default here, on purpose: every call site names the width it actually
 * uses, so a page added later without one is a build-time prop error rather than a header
 * that quietly stops matching what it sits on.
 *
 * The brand mark is the way back to `/` — for the legal pages this replaces the bespoke
 * «← Strumfolio» link `(legal)/layout.tsx` used to draw inline, and for `/pricing` the inline
 * one that sat above its own heading; a second way home directly under this bar would only
 * repeat what the header already says.
 */
export function PublicHeader({ width }: { width: string }) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner" style={{ '--top-bar-width': width } as React.CSSProperties}>
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
