import type { Metadata } from 'next'

import { SongbookManager } from '@/components/SongbookManager'
import { SongbookProvider } from '@/components/SongbookProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Songbooks' }

/**
 * Where songbooks are made, renamed and removed — not where they are read.
 *
 * Reading one is the home page's job, and from there each leads to its own page. This
 * screen is the other half: the operations that change the shape of the library rather
 * than move through it, which is why it lives behind the menu instead of on the way in.
 */
export default async function SongbooksPage() {
  const [songs, songbooks, sections] = await Promise.all([
    repository.listSongs(),
    repository.listSongbooks(),
    repository.listSections(),
  ])

  const initial = snapshot(songs, songbooks, sections)

  return (
    // The menu in the header holds a reader preference, so it needs this here too.
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={initial}>
        <TopBar current="songbooks" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <header className="mb-[1.125rem]">
            <h1 className="screen-title">Songbooks</h1>
            <p className="mt-2 text-sm leading-[1.45] text-muted">
              Every song belongs to one songbook, and only one. Renaming one moves nothing: the
              name changes, its page&apos;s address stays the same.
            </p>
          </header>

          <SongbookManager />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
