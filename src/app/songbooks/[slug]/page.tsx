import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SongbookProvider } from '@/components/SongbookProvider'
import { SongbookSongs } from '@/components/SongbookSongs'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'
import { toIndexRow } from '@/lib/search-index'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * One page per songbook, generated like the songs are.
 *
 * There deliberately was not one of these. The reasons given were that a songbook
 * created in the app would have no page until the next build, and that renaming one
 * would move its route — and only the first is true. The slug is generated once and
 * frozen (see `db/schema.ts`), so a rename touches the name and nothing else; and
 * needing a rebuild to be available offline is exactly the deal every imported song
 * already lives with, which is what «Rebuild now» is for.
 *
 * What was on the other side of the ledger: opening a songbook had to happen inside
 * the home page, as a fold, because there was nowhere else for it to happen.
 */
export async function generateStaticParams() {
  const songbooks = await repository.listSongbooks()
  return songbooks.map((songbook) => ({ slug: songbook.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const songbooks = await repository.listSongbooks()
  const songbook = songbooks.find((entry) => entry.slug === slug)

  return { title: songbook?.name ?? 'Songbook not found' }
}

export default async function SongbookPage({ params }: Props) {
  const { slug } = await params

  const [songs, songbooks, sections] = await Promise.all([
    repository.listSongs(),
    repository.listSongbooks(),
    repository.listSections(),
  ])

  const songbook = songbooks.find((entry) => entry.slug === slug)
  if (songbook === undefined) notFound()

  const initial = snapshot(songs, songbooks, sections)

  /*
   * This songbook's songs, in the order `listSongs` reads them — position first, then
   * title. The rows carry no lyrics: there is nothing to search on this screen, and the
   * words of two dozen songs would otherwise ride along in the page for nothing.
   */
  const mine = songs.filter((song) => song.songbookSlug === slug).map(toIndexRow)

  return (
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={initial}>
        {/* No back link: the brand next to it already leads to the list of songbooks. */}
        <TopBar current="songbooks" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          {/*
            * The name here, the counts inside: they belong to the list, and the list is
            * the live one. Counting here would have this line and the cards below it
            * disagree on the same screen until the next rebuild — a section created a
            * minute ago is in the cards immediately.
            */}
          <header className="mb-4">
            <h1 className="screen-title">{songbook.name}</h1>
          </header>

          <SongbookSongs slug={slug} songs={mine} />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
