import Link from 'next/link'

import { PrefsProvider } from '@/components/PrefsProvider'
import { SongList } from '@/components/SongList'
import { repository } from '@/lib/data'
import { toIndexEntry } from '@/lib/search-index'

export default async function Home() {
  const [songs, setlists] = await Promise.all([
    repository.listSongs(),
    repository.listSetlists(),
  ])

  return (
    <PrefsProvider songSlug={null}>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Canzoni</h1>
          {setlists.length > 0 && (
            <Link href="/scalette" className="text-sm underline-offset-2 hover:underline">
              Scalette
            </Link>
          )}
        </header>

        <SongList songs={songs.map(toIndexEntry)} />
      </main>
    </PrefsProvider>
  )
}
