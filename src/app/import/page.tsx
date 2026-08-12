import type { Metadata } from 'next'

import { SongbookProvider } from '@/components/SongbookProvider'
import { ImportScreen } from '@/components/ImportScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { snapshot } from '@/lib/songbooks/snapshot'
import { UNFILED, repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Import' }

/**
 * Static shell, precached like the rest. Everything mutable — the pending list —
 * is read at runtime, so the page itself never needs regenerating to be correct.
 *
 * The songbooks too, through the provider rather than the baked list: this screen
 * asks which one to import into, and one made a minute ago on `/songbooks` has no
 * page of its own to wait for. Offering a stale set of destinations here would be
 * the same bug as a stale song — the build is not the authority on what exists.
 */
export default async function ImportPage() {
  const [songbooks, songs, sections] = await Promise.all([
    repository.listSongbooks(),
    repository.listSongs(),
    repository.listSections(),
  ])

  const preferred =
    songbooks.find((entry) => entry.slug === UNFILED.slug)?.slug ??
    songbooks[0]?.slug ??
    UNFILED.slug


  return (
    // The preview renders a real sheet, which reads zoom and notation from here.
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={snapshot(songs, songbooks, sections)}>
        <TopBar current="import" />

        <main className="mx-auto max-w-5xl px-4 pb-12 pt-3">
          <h1 className="screen-title mb-4">Import</h1>

          <ImportScreen defaultSongbook={preferred} />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
