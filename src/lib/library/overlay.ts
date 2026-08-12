/**
 * When a copy of a song fetched at runtime replaces the one baked into the page.
 *
 * Pages are generated at build time and precached, so between two deploys the
 * database can hold a newer version of a song than the browser is showing. The
 * overlay is how the newer one gets on screen without waiting for a rebuild.
 *
 * Everything here compares one thing only: the version the page was built from
 * against the version the server just returned. No build stamps, no clocks, no
 * "was there a deploy recently" — the stamp is written before the build runs, so
 * anything derived from it is wrong for the whole length of a deploy, and a
 * client-side timestamp would be a guess about a value only the database owns.
 * Comparing content versions is true whether the page came from the precache,
 * from the server, or from a build that finished five seconds ago.
 */

import type { Song } from '../data/types'
import type { SongIndexEntry, SongIndexRow } from '../search-index'

/** What the server has to say about one song. */
export type SongContent =
  | { state: 'found'; song: Song }
  /** The song is gone from the database. Only this means deleted. */
  | { state: 'missing' }
  /** No database, no session, or no answer. Says nothing about the song. */
  | { state: 'unavailable' }

interface Versioned {
  updatedAt: string | null
}

/**
 * Whether `fresh` is a later version than `baked`.
 *
 * Both timestamps come from the same column through `toISOString`, which is
 * fixed-width and always UTC, so comparing the strings is comparing the instants.
 * And that column is written by the database's own clock — see the writes in
 * `import/actions.ts` — so the two instants are on the same clock, not on two
 * machines' guesses about the time.
 *
 * The two null cases are not symmetrical. A `fresh` without a timestamp cannot be
 * shown to be newer, so it loses. A `baked` without one means the page was
 * generated from files rather than a database, and then anything the database
 * says is more current than the page.
 */
export function isNewer(fresh: Versioned, baked: Versioned): boolean {
  if (fresh.updatedAt === null) return false
  if (baked.updatedAt === null) return true
  return fresh.updatedAt > baked.updatedAt
}

/**
 * Everything searchable about a song whose body the browser has not got.
 *
 * A song imported since the last build is in this list before its lyrics are: the
 * index the page ships was built with the page. Title, artist and tags still
 * match, and the lyrics join in at the next publish.
 */
export function liveHaystack(row: SongIndexRow, lyrics = ''): string {
  return [row.title, row.artist ?? '', row.tags.join(' '), lyrics].join('\n').toLowerCase()
}

/**
 * The list as it is now, from the list the page was built with and what the
 * database currently holds.
 *
 * The live rows drive the result, which is what makes all three changes appear at
 * once: a song added since the build is in them and gets a row, a song deleted
 * since the build is not in them and loses its row, and a song edited since the
 * build brings its new title along. Order comes from the live rows too, so a
 * retitled song sorts where its new title belongs.
 *
 * A song the build already had keeps its baked haystack, so its lyrics stay
 * searchable; the new title and artist are added to it rather than replacing it,
 * because the lyrics in there are still the ones this browser can show.
 */
export function mergeIndex(baked: SongIndexEntry[], live: SongIndexRow[]): SongIndexEntry[] {
  const known = new Map(baked.map((entry) => [entry.slug, entry]))

  return live.map((row) => {
    const entry = known.get(row.slug)

    if (entry === undefined) {
      return { ...row, haystack: liveHaystack(row) }
    }

    if (!isNewer(row, entry)) return entry

    return { ...entry, ...row, haystack: liveHaystack(row, entry.haystack) }
  })
}
