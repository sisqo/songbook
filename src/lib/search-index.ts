import { parseChordPro, plainLyrics } from './chordpro'
import type { Song } from './data'

/**
 * One row of the list, prepared at build time.
 *
 * Lives here rather than beside the component that renders it because it is data:
 * the build produces it, the list shows it, and the runtime overlay rewrites it.
 */
export interface SongIndexEntry {
  slug: string
  title: string
  artist: string | null
  originalKey: string | null
  tags: string[]
  /** Which version this row describes; null with no database. */
  updatedAt: string | null
  /** Lyrics with chords stripped, lowercased, for matching. */
  haystack: string
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

  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    originalKey: song.originalKey,
    tags: song.tags,
    updatedAt: song.updatedAt,
    haystack,
  }
}
