import Link from 'next/link'

import { SignOutButton } from '@/components/SignOutButton'
import { IconBooks, IconImport, IconNote, IconSetlist } from '@/components/icons'

export type Section = 'canzoni' | 'importa' | 'canzonieri' | 'scalette'

/**
 * The bar shared by every screen except the reading page.
 *
 * The active section arrives as a prop rather than from `usePathname`, so this
 * stays a server component: the pages it sits on are statically generated and
 * precached, and nothing here should be able to change that.
 *
 * On a phone the links are icons alone — four labels plus "Esci" do not fit in
 * 390px, and the previous header proved it by cutting "Esci" off the screen.
 * Labels appear from 640px up.
 */
export function TopBar({
  current,
  showSetlists = true,
}: {
  current: Section
  showSetlists?: boolean
}) {
  const link = (section: Section) => (section === current ? 'nav-link is-on' : 'nav-link')

  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <Link href="/" className="brand" aria-label="songs, tutte le canzoni">
          <span className="brand-mark">
            <IconNote size={15} />
          </span>
          <span>songs</span>
        </Link>

        <span className="flex-1" />

        <nav className="flex items-center gap-0.5" aria-label="Sezioni">
          <Link href="/importa" className={link('importa')} title="Importa">
            <IconImport />
            <span className="hidden sm:inline">Importa</span>
          </Link>

          <Link href="/canzonieri" className={link('canzonieri')} title="Canzonieri">
            <IconBooks />
            <span className="hidden sm:inline">Canzonieri</span>
          </Link>

          {showSetlists && (
            <Link href="/scalette" className={link('scalette')} title="Scalette">
              <IconSetlist />
              <span className="hidden sm:inline">Scalette</span>
            </Link>
          )}

          <SignOutButton />
        </nav>
      </div>
    </header>
  )
}
