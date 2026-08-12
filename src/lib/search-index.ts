import { parseChordPro, plainLyrics } from './chordpro'
import type { Song } from './data'

/**
 * Enough of a song to draw a row in a list: everything except its words.
 *
 * This is also exactly what the runtime overlay fetches for every song at once, which
 * is why the two are the same shape — a list baked at build time and a list refreshed
 * from the database have to be interchangeable row by row.
 */
export interface SongIndexRow {
  slug: string
  title: string
  artist: string | null
  tags: string[]
  /** Which version this row describes; null with no database. */
  updatedAt: string | null
}

/**
 * A row plus what makes it findable, prepared at build time.
 *
 * Lives here rather than beside the component that renders it because it is data:
 * the build produces it, the list shows it, and the runtime overlay rewrites it.
 */
export interface SongIndexEntry extends SongIndexRow {
  /** Lyrics with chords stripped, lowercased, for matching. */
  haystack: string
}

/** The row on its own, for a list with nothing to search — a single canzoniere's. */
export function toIndexRow(song: Song): SongIndexRow {
  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    tags: song.tags,
    updatedAt: song.updatedAt,
  }
}

/**
 * Builds the searchable row for one song.
 *
 * Everything searchable is flattened into one lowercased string at build time,
 * so matching at runtime is a substring test and nothing has to be parsed in the
 * browser. Chords are excluded: searching for "la" should not match every song
 * containing an A chord.
 */
export function toIndexEntry(song: Song): SongIndexEntry {
  const parsed = parseChordPro(song.body)

  const haystack = [song.title, song.artist ?? '', song.tags.join(' '), plainLyrics(parsed)]
    .join('\n')
    .toLowerCase()

  return { ...toIndexRow(song), haystack }
}
