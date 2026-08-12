import Link from 'next/link'

import type { SongIndexRow } from '@/lib/search-index'

/**
 * One song, as a row that opens it.
 *
 * Shared by the two lists that show songs — the search results on the home page and a
 * songbook's own page — so a song looks the same wherever it is found. `under` is
 * what the search adds: found from anywhere, a row has to say where it lives.
 */
export function SongRow({
  song,
  under,
}: {
  song: SongIndexRow
  /** A second line under the title, used by search results to say which songbook. */
  under?: string | null
}) {
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
