import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { CanzoniereSongs } from '@/components/CanzoniereSongs'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'
import { toIndexRow } from '@/lib/search-index'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * One page per canzoniere, generated like the songs are.
 *
 * There deliberately was not one of these. The reasons given were that a canzoniere
 * created in the app would have no page until the next build, and that renaming one
 * would move its route — and only the first is true. The slug is generated once and
 * frozen (see `db/schema.ts`), so a rename touches the name and nothing else; and
 * needing a rebuild to be available offline is exactly the deal every imported song
 * already lives with, which is what «Ricostruisci ora» is for.
 *
 * What was on the other side of the ledger: opening a canzoniere had to happen inside
 * the home page, as a fold, because there was nowhere else for it to happen.
 */
export async function generateStaticParams() {
  const canzonieri = await repository.listCanzonieri()
  return canzonieri.map((canzoniere) => ({ slug: canzoniere.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const canzonieri = await repository.listCanzonieri()
  const canzoniere = canzonieri.find((entry) => entry.slug === slug)

  return { title: canzoniere?.name ?? 'Canzoniere non trovato' }
}

export default async function CanzonierePage({ params }: Props) {
  const { slug } = await params

  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
  ])

  const canzoniere = canzonieri.find((entry) => entry.slug === slug)
  if (canzoniere === undefined) notFound()

  const initial: CanzoniereState = {
    canzonieri,
    assignments: Object.fromEntries(
      songs
        .filter((song) => song.canzoniereSlug !== null)
        .map((song) => [song.slug, song.canzoniereSlug as string]),
    ),
  }

  /*
   * This canzoniere's songs, in the order `listSongs` reads them — position first, then
   * title. The rows carry no lyrics: there is nothing to search on this screen, and the
   * words of two dozen songs would otherwise ride along in the page for nothing.
   */
  const mine = songs.filter((song) => song.canzoniereSlug === slug).map(toIndexRow)

  return (
    <PrefsProvider songSlug={null}>
      <CanzoniereProvider initial={initial}>
        {/* No back link: the brand next to it already leads to the list of canzonieri. */}
        <TopBar current="canzonieri" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <header className="mb-4">
            <h1 className="screen-title">{canzoniere.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {mine.length} {mine.length === 1 ? 'brano' : 'brani'}
            </p>
          </header>

          <CanzoniereSongs slug={slug} songs={mine} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
