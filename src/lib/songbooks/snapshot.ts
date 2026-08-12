import type { Songbook, Section, Song } from '@/lib/data/types'

import type { SongbookState } from './types'

/**
 * The mutable layer as the build saw it, for a page to hand its provider.
 *
 * Five pages need this and each used to build it inline, which was fine while it was two
 * lines and one map. With sections it is three lists that have to agree — and a page that
 * baked a half-state would teach the local cache that no song is filed anywhere, since
 * the provider caches whatever it is holding.
 *
 * Songs without a section are simply left out of the map: see `SongbookState`.
 */
export function snapshot(
  songs: Song[],
  songbooks: Songbook[],
  sections: Section[],
): SongbookState {
  return {
    songbooks,
    sections,
    assignments: Object.fromEntries(
      songs
        .filter((song) => song.sectionId !== null)
        .map((song) => [song.slug, song.sectionId as number]),
    ),
  }
}
