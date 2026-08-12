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
          <h1 className="screen-title mb-4">Songs</h1>

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
