import type { Song } from '@/lib/data'

export interface Series {
  position: number
  total: number
  previous: string | null
  next: string | null
}

/**
 * Where a song sits among the others of its songbook: not just its section, but the
 * whole songbook in the order `listSongs` reads it — section by section, and inside
 * each the order somebody put them in — so the last song of one section is followed by
 * the first of the next. A songbook stays one sequence and the sections are its
 * structure: stopping at a boundary would mean going back and reopening a section in
 * the middle of an evening.
 *
 * `null` when the songbook holds only this one song: there is nothing to step through.
 */
export function seriesOf(song: Song, songs: Song[]): Series | null {
  const siblings = songs.filter((entry) => entry.songbookSlug === song.songbookSlug)
  const index = siblings.findIndex((entry) => entry.slug === song.slug)
  if (index === -1 || siblings.length < 2) return null

  const at = (position: number): string | null => siblings[position]?.slug ?? null

  return {
    position: index + 1,
    total: siblings.length,
    previous: at(index - 1),
    next: at(index + 1),
  }
}
