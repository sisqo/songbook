'use server'

/**
 * What a guest may read with only a Sing Together token: the whole repertoire, the
 * same as any signed-in viewer would see, and nothing that needs an account — no
 * writes, no membership, no role. Kept apart from `./session`, which is the other
 * side of the same feature: what only the broadcast's own owner may change.
 *
 * Every export here starts by asking `isTokenActive`, and answers `null` if the
 * token does not resolve to a live broadcast — the same "refusal, not an empty
 * answer" rule the rest of the app uses for a reader whose role has just changed
 * under them.
 */

import { repository } from '@/lib/data'
import type { Song } from '@/lib/data/types'

import { isTokenActive } from './session'

export interface GuestSongbook {
  slug: string
  name: string
  count: number
}

export async function guestListSongbooks(token: string): Promise<GuestSongbook[] | null> {
  if (!(await isTokenActive(token))) return null

  const [songbooks, songs] = await Promise.all([
    repository.listSongbooks(),
    repository.listSongs(),
  ])

  return songbooks.map((songbook) => ({
    ...songbook,
    count: songs.filter((song) => song.songbookSlug === songbook.slug).length,
  }))
}

export interface GuestSection {
  id: number
  name: string
  songs: { slug: string; title: string; artist: string | null }[]
}

export interface GuestSongbookContent {
  songbookName: string
  sections: GuestSection[]
}

/**
 * One songbook's songs, grouped by section, in the same order the reading pages use —
 * `repository.listSongs()` already returns them section by section and then in place,
 * so grouping by section here is a filter, never a re-sort.
 */
export async function guestListSongs(
  token: string,
  songbookSlug: string,
): Promise<GuestSongbookContent | null> {
  if (!(await isTokenActive(token))) return null

  const [songbooks, sections, songs] = await Promise.all([
    repository.listSongbooks(),
    repository.listSections(),
    repository.listSongs(),
  ])

  const songbook = songbooks.find((entry) => entry.slug === songbookSlug)
  if (songbook === undefined) return null

  const divisions = sections
    .filter((section) => section.songbookSlug === songbookSlug)
    .sort((a, b) => a.position - b.position)

  return {
    songbookName: songbook.name,
    sections: divisions.map((section) => ({
      id: section.id,
      name: section.name,
      songs: songs
        .filter((song) => song.sectionId === section.id)
        .map((song) => ({ slug: song.slug, title: song.title, artist: song.artist })),
    })),
  }
}

export async function guestLoadSong(token: string, slug: string): Promise<Song | null> {
  if (!(await isTokenActive(token))) return null
  return repository.getSong(slug)
}
