import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { repository } from '@/lib/data'

interface Props {
  params: Promise<{ setlist: string }>
}

export async function generateStaticParams() {
  const setlists = await repository.listSetlists()
  return setlists.map((setlist) => ({ setlist: setlist.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setlist: slug } = await params
  const setlist = await repository.getSetlist(slug)
  return { title: setlist?.name ?? 'Scaletta non trovata' }
}

export default async function SetlistPage({ params }: Props) {
  const { setlist: slug } = await params
  const setlist = await repository.getSetlist(slug)
  if (!setlist) notFound()

  const songs = await Promise.all(setlist.songs.map((songSlug) => repository.getSong(songSlug)))

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <nav className="mb-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Link href="/scalette" className="underline-offset-2 hover:underline">
            ‹ Scalette
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{setlist.name}</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {setlist.songs.length} {setlist.songs.length === 1 ? 'brano' : 'brani'}
        </p>
      </header>

      <ol>
        {songs.map((song, index) =>
          song === null ? null : (
            <li key={song.slug} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <Link
                href={`/scalette/${setlist.slug}/${song.slug}`}
                className="flex items-baseline gap-3 py-3"
              >
                <span className="w-6 flex-none text-sm tabular-nums" style={{ color: 'var(--faint)' }}>
                  {index + 1}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{song.title}</span>
                  {song.artist !== null && (
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      {' · '}
                      {song.artist}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ),
        )}
      </ol>
    </main>
  )
}
