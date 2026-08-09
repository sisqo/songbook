import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SongReader } from '@/components/SongReader'
import { repository } from '@/lib/data'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * One static page per song, generated from whichever repository is active. This
 * is what lets the service worker precache the whole repertoire and what keeps
 * the database off the reading path.
 */
export async function generateStaticParams() {
  const songs = await repository.listSongs()
  return songs.map((song) => ({ slug: song.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const song = await repository.getSong(slug)
  if (!song) return { title: 'Canzone non trovata' }

  return {
    title: song.artist === null ? song.title : `${song.title} · ${song.artist}`,
  }
}

export default async function SongPage({ params }: Props) {
  const { slug } = await params
  const song = await repository.getSong(slug)
  if (!song) notFound()

  return <SongReader song={song} />
}
