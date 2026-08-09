import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { type SetlistContext, SongReader } from '@/components/SongReader'
import { repository } from '@/lib/data'

interface Props {
  params: Promise<{ setlist: string; song: string }>
}

/**
 * Reading a song inside a setlist is its own route rather than a query string on
 * the song page. That costs one static page per (setlist, song) pair, and buys
 * two things that matter: previous and next are known at build time, and the
 * service worker precaches these URLs exactly as they will be requested — a
 * query string would not be part of the precached URL.
 */
export async function generateStaticParams() {
  const setlists = await repository.listSetlists()

  return setlists.flatMap((setlist) =>
    setlist.songs.map((song) => ({ setlist: setlist.slug, song })),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { song: slug } = await params
  const song = await repository.getSong(slug)
  return { title: song?.title ?? 'Canzone non trovata' }
}

export default async function SetlistSongPage({ params }: Props) {
  const { setlist: setlistSlug, song: songSlug } = await params

  const [setlist, song] = await Promise.all([
    repository.getSetlist(setlistSlug),
    repository.getSong(songSlug),
  ])
  if (!setlist || !song) notFound()

  const index = setlist.songs.indexOf(songSlug)
  if (index === -1) notFound()

  const neighbour = async (position: number) => {
    if (position < 0 || position >= setlist.songs.length) return null
    const found = await repository.getSong(setlist.songs[position])
    return found === null ? null : { slug: found.slug, title: found.title }
  }

  const context: SetlistContext = {
    slug: setlist.slug,
    name: setlist.name,
    position: index + 1,
    total: setlist.songs.length,
    previous: await neighbour(index - 1),
    next: await neighbour(index + 1),
  }

  return <SongReader song={song} setlist={context} />
}
