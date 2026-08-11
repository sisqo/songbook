import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongList } from '@/components/SongList'
import { TopBar } from '@/components/TopBar'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'
import { toIndexEntry } from '@/lib/search-index'

export default async function Home() {
  const [songs, setlists, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listSetlists(),
    repository.listCanzonieri(),
  ])

  // Snapshot of the mutable layer, so the first paint already shows the right
  // names; the client refreshes it from the server after mount.
  const initial: CanzoniereState = {
    canzonieri,
    assignments: Object.fromEntries(
      songs
        .filter((song) => song.canzoniereSlug !== null)
        .map((song) => [song.slug, song.canzoniereSlug as string]),
    ),
  }

  return (
    <PrefsProvider songSlug={null}>
      <CanzoniereProvider initial={initial}>
        <TopBar current="canzoni" showSetlists={setlists.length > 0} />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <h1 className="screen-title mb-4">Canzoni</h1>

          <SongList songs={songs.map(toIndexEntry)} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
