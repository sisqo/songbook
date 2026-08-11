import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TopBar } from '@/components/TopBar'
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
    <>
      <TopBar current="scalette" back={{ href: '/scalette', label: 'Scalette' }} />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">{setlist.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {setlist.songs.length} {setlist.songs.length === 1 ? 'brano' : 'brani'}
          </p>
        </header>

        {/*
          * One card, not one per song: the order is the point of a setlist, and songs
          * in separate cards read as a set of choices rather than as a sequence.
          */}
        <ol className="row-list card card-lead">
          {songs.map((song, index) =>
            song === null ? null : (
              <li key={song.slug}>
                <Link
                  href={`/scalette/${setlist.slug}/${song.slug}`}
                  className="row gap-3.5 py-3"
                >
                  <span className="w-[1.375rem] flex-none text-sm tabular-nums text-faint">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{song.title}</span>
                    {song.artist !== null && (
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
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
    </>
  )
}
