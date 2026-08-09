import type { SongIndexEntry } from '@/components/SongList'

import { parseChordPro, plainLyrics } from './chordpro'
import type { Song } from './data'

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
    haystack,
  }
}
