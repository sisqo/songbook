import type { Metadata } from 'next'

import { CanzoniereManager } from '@/components/CanzoniereManager'
import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Canzonieri' }

/**
 * Where canzonieri are made, renamed and removed — not where they are read.
 *
 * Reading one is the home page's job, and from there each leads to its own page. This
 * screen is the other half: the operations that change the shape of the library rather
 * than move through it, which is why it lives behind the menu instead of on the way in.
 */
export default async function CanzonieriPage() {
  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
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
    // The menu in the header holds a reader preference, so it needs this here too.
    <PrefsProvider songSlug={null}>
      <CanzoniereProvider initial={initial}>
        <TopBar current="canzonieri" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <header className="mb-[1.125rem]">
            <h1 className="screen-title">Canzonieri</h1>
            <p className="mt-2 text-sm leading-[1.45] text-muted">
              Ogni brano appartiene a un canzoniere, e a uno solo. Rinominarne uno non sposta
              niente: il nome cambia, l&apos;indirizzo della sua pagina resta.
            </p>
          </header>

          <CanzoniereManager />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
