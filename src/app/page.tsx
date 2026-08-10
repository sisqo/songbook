import Link from 'next/link'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SignOutButton } from '@/components/SignOutButton'
import { SongList } from '@/components/SongList'
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
        <main className="mx-auto max-w-3xl px-4 py-6">
          <header className="mb-5 flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Canzoni</h1>
            <div className="flex items-baseline gap-4" style={{ color: 'var(--muted)' }}>
              <Link href="/canzonieri" className="text-sm underline-offset-2 hover:underline">
                Canzonieri
              </Link>
              {setlists.length > 0 && (
                <Link href="/scalette" className="text-sm underline-offset-2 hover:underline">
                  Scalette
                </Link>
              )}
              <SignOutButton />
            </div>
          </header>

          <SongList songs={songs.map(toIndexEntry)} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
