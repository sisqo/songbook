'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { formatKey } from '@/lib/music/chord'
import { parseKey } from '@/lib/music/notes'

/** One row of the index, prepared at build time. */
export interface SongIndexEntry {
  slug: string
  title: string
  artist: string | null
  originalKey: string | null
  tags: string[]
  /** Lyrics with chords stripped, lowercased, for matching. */
  haystack: string
}

/** Shows the song's own key in the reader's notation, or as written if unparseable. */
function formatKeyLabel(raw: string, notation: 'it' | 'int'): string {
  const key = parseKey(raw)
  return key === null ? raw : formatKey(key, notation)
}

/**
 * The song list with instant search.
 *
 * The index travels with the page rather than being fetched, so searching costs
 * no network at all and keeps working offline — which for a precached page is
 * the only way it could work.
 */
export function SongList({ songs }: { songs: SongIndexEntry[] }) {
  const { global } = usePrefs()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    if (needle === '') return songs

    // Every term must appear somewhere, so "certe notti" and "notti certe" match.
    const terms = needle.split(/\s+/)
    return songs.filter((song) => terms.every((term) => song.haystack.includes(term)))
  }, [songs, deferred])

  return (
    <div>
      <label className="block">
        <span className="sr-only">Cerca fra le canzoni</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca titolo, artista o testo"
          autoComplete="off"
          className="w-full rounded-xl border px-4 py-3 text-base"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
        />
      </label>

      <p className="mt-3 text-xs" style={{ color: 'var(--faint)' }} aria-live="polite">
        {results.length === songs.length
          ? `${songs.length} ${songs.length === 1 ? 'canzone' : 'canzoni'}`
          : `${results.length} di ${songs.length}`}
      </p>

      {results.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: 'var(--muted)' }}>
          Nessuna canzone trovata.
        </p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: 'var(--line)' }}>
          {results.map((song) => (
            <li key={song.slug} style={{ borderColor: 'var(--line)' }} className="border-t">
              <Link
                href={`/canzoni/${song.slug}`}
                className="flex items-baseline justify-between gap-3 py-3"
              >
                <span>
                  <span className="font-medium">{song.title}</span>
                  {song.artist !== null && (
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      {' · '}
                      {song.artist}
                    </span>
                  )}
                </span>
                {song.originalKey !== null && (
                  <span className="flex-none text-sm" style={{ color: 'var(--accent)' }}>
                    {formatKeyLabel(song.originalKey, global.notation)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
