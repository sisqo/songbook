import type { Metadata } from 'next'

import { CanzoniereManager } from '@/components/CanzoniereManager'
import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { TopBar } from '@/components/TopBar'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Canzonieri' }

/**
 * The only new route the feature adds: a static shell, precached like the rest.
 *
 * There is deliberately no `/canzonieri/[slug]` page. One created in the app
 * would not exist among the routes generated at build time, so it would not be
 * precached and would be missing offline; and a rename would move the route.
 * Opening a canzoniere means opening its first song, from the home list.
 */
export default async function CanzonieriPage() {
  const [songs, canzonieri, setlists] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
    repository.listSetlists(),
  ])

  const initial: CanzoniereState = {
    canzonieri,
    assignments: Object.fromEntries(
      songs
        .filter((song) => song.canzoniereSlug !== null)
        .map((song) => [song.slug, song.canzoniereSlug as string]),
    ),
  }

  return (
    <CanzoniereProvider initial={initial}>
      <TopBar current="canzonieri" showSetlists={setlists.length > 0} />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-5">
        <header className="mb-5">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
            Canzonieri
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ogni brano appartiene a un canzoniere. Le scalette sono un&apos;altra cosa e possono
            mescolarli.
          </p>
        </header>

        <CanzoniereManager />
      </main>
    </CanzoniereProvider>
  )
}
