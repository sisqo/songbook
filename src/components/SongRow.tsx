import Link from 'next/link'

import type { SongIndexRow } from '@/lib/search-index'

/**
 * One song, as a row that opens it.
 *
 * Shared by the two lists that show songs — the search results on the home page and a
 * songbook's own page — so a song looks the same wherever it is found. `under` is
 * what the search adds: found from anywhere, a row has to say where it lives.
 *
 * `index` is the other shape a caller can ask for: a song's place inside its own
 * section, which only means something there — search has no single order across
 * songbooks to number, so it never passes one. With an index the artist moves to
 * the row's far end instead of stacking under the title: the section a reader is
 * already inside of is the "where", so there is nothing left for a second line to say.
 */
export function SongRow({
  song,
  index,
  under,
}: {
  song: SongIndexRow
  /** This song's 1-based place in its section's list. */
  index?: number
  /** A second line under the title, used by search results to say which songbook. */
  under?: string | null
}) {
  if (index !== undefined) {
    return (
      <Link href={`/songs/${song.slug}`} className="row">
        <span className="row-index" aria-hidden>
          {index}
        </span>
        <span className="min-w-0 flex-1 truncate">{song.title}</span>
        {song.artist !== null && (
          <span className="flex-none truncate text-[0.9375rem] text-muted" style={{ maxWidth: '40%' }}>
            {song.artist}
          </span>
        )}
      </Link>
    )
  }

  const where = under ?? null

  return (
    <Link href={`/songs/${song.slug}`} className="row">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{song.title}</span>
        {(song.artist !== null || where !== null) && (
          <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
            {song.artist}
            {song.artist !== null && where !== null && <span className="text-faint"> · </span>}
            {where !== null && <span className="text-faint">{where}</span>}
          </span>
        )}
      </span>
    </Link>
  )
}
