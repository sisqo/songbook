import { SongbookProvider } from '@/components/SongbookProvider'
import { HomeScreen } from '@/components/HomeScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'
import { toIndexEntry } from '@/lib/search-index'

export default async function Home() {
  const [songs, songbooks, sections] = await Promise.all([
    repository.listSongs(),
    repository.listSongbooks(),
    repository.listSections(),
  ])

  // Snapshot of the mutable layer, so the first paint already shows the right
  // names; the client refreshes it from the server after mount.
  const initial = snapshot(songs, songbooks, sections)

  return (
    <PrefsProvider songSlug={null}>
      <SongbookProvider initial={initial}>
        <TopBar current="songs" />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          {/* Not a title anyone needs to read: this is the page you land on, and the
              search box is the first thing to do here, not something to find under a
              heading. Still an <h1>, just not a visible one — a screen reader moving by
              heading still gets told which page this is. */}
          <h1 className="sr-only">Home</h1>

          {/*
            * Every song's searchable text, even though this screen lists songbooks: the
            * search box is here, and it searches the words. That is also why the whole
            * index is baked in rather than fetched — a search that needs the network is
            * no use on stage.
            */}
          <HomeScreen songs={songs.map(toIndexEntry)} />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
