import type { Metadata } from 'next'

import { MemberManager } from '@/components/MemberManager'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Users' }

/**
 * Who may enter.
 *
 * A static shell like every other screen, and precached like them, but with nothing
 * baked into it: the list arrives from the server after mount. That is the one place
 * where being offline has to be admitted rather than papered over — a cached list of
 * who has access could say yes about someone who no longer does.
 */
export default function UsersPage() {
  return (
    // The menu in the header holds a reader preference, so it needs this here too.
    <PrefsProvider songSlug={null}>
      <TopBar current="users" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Users</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            The repertoire is protected material, so entry is a list: a valid Google account,
            on its own, doesn&apos;t open anything.
          </p>
        </header>

        <MemberManager />
      </main>
    </PrefsProvider>
  )
}
