import Link from 'next/link'

import { NavMenu } from '@/components/NavMenu'
import { SignOutButton } from '@/components/SignOutButton'
import { IconChevronLeft, IconNote } from '@/components/icons'

export type Section = 'canzoni' | 'importa' | 'canzonieri' | 'scalette'

/**
 * The header, on every screen inside the app.
 *
 * The sections live in a menu rather than in the bar itself: five labels never
 * fit a phone — the first version proved it by cutting "Esci" off the right edge
 * — and icons alone said too little.
 *
 * `back` replaces the brand with a contextual return link, which is what keeps
 * the reading page down to one header row instead of two: inside a setlist that
 * link also carries the position, "‹ Sabato in cantina · 2 di 12".
 *
 * The active section arrives as a prop rather than from `usePathname`, so the
 * server renders it: these pages are statically generated and precached, and
 * nothing here should be able to change that.
 */
export function TopBar({
  current,
  showSetlists = true,
  back,
}: {
  current: Section
  showSetlists?: boolean
  back?: { href: string; label: string }
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        {back === undefined ? (
          <Link href="/" className="brand" aria-label="songs, tutte le canzoni">
            <span className="brand-mark">
              <IconNote size={15} />
            </span>
            <span>songs</span>
          </Link>
        ) : (
          <Link href={back.href} className="back-link min-w-0">
            <IconChevronLeft size={16} />
            <span className="truncate">{back.label}</span>
          </Link>
        )}

        <span className="flex-1" />

        <NavMenu current={current} showSetlists={showSetlists}>
          <SignOutButton />
        </NavMenu>
      </div>
    </header>
  )
}
