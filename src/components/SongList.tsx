'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { usePrefs } from '@/components/PrefsProvider'
import { IconChevronRight, IconSearch } from '@/components/icons'
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
 * Search, and the canzonieri as the way in.
 *
 * The home page lists no songs: it offers the canzonieri, each a link to its
 * first song, and from there the reading page steps through the rest. Songs
 * appear here only as search results, which is what keeps the search box from
 * being a control with nowhere to put its answer.
 *
 * The index travels with the page rather than being fetched, so searching costs
 * no network at all and keeps working offline — which for a precached page is the
 * only way it could work.
 *
 * Two things could otherwise strand a song. One with no canzoniere at all gets a
 * "Senza canzoniere" entry, and a database with no canzonieri falls back to
 * listing everything, because otherwise this page would be a search box and
 * nothing else.
 */
export function SongList({ songs }: { songs: SongIndexEntry[] }) {
  const { global } = usePrefs()
  const { canzonieri, assignments, nameOf } = useCanzonieri()

  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    const terms = needle === '' ? [] : needle.split(/\s+/)

    // Every term must appear somewhere, so "certe notti" and "notti certe" match.
    return songs.filter((song) => terms.every((term) => song.haystack.includes(term)))
  }, [songs, deferred])

  const firstSongOf = (canzoniereSlug: string | undefined) =>
    songs.find((song) => assignments[song.slug] === canzoniereSlug)?.slug ?? null

  const orphan = firstSongOf(undefined)
  const searching = deferred.trim() !== ''
  // With no canzonieri to offer, the list is the only way to reach anything.
  const showList = searching || canzonieri.length === 0

  return (
    <div>
      <label className="search-field block">
        <span className="sr-only">Cerca fra le canzoni</span>
        <IconSearch />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca titolo, artista o testo"
          autoComplete="off"
          className="form-field"
        />
      </label>

      {canzonieri.length > 0 && (
        <nav className="mt-5" aria-label="Canzonieri">
          <p className="mb-2 px-1 text-xs text-faint">Apri un canzoniere dalla prima canzone</p>
          <div className="chip-row">
            {canzonieri.map((canzoniere) => {
              const first = firstSongOf(canzoniere.slug)

              return first === null ? (
                <span
                  key={canzoniere.slug}
                  className="chip is-empty"
                  title={`${canzoniere.name} non contiene brani`}
                >
                  {canzoniere.name}
                </span>
              ) : (
                <Link key={canzoniere.slug} href={`/canzoni/${first}`} className="chip">
                  {canzoniere.name}
                  <IconChevronRight size={13} />
                </Link>
              )
            })}

            {orphan !== null && (
              <Link href={`/canzoni/${orphan}`} className="chip">
                Senza canzoniere
                <IconChevronRight size={13} />
              </Link>
            )}
          </div>
        </nav>
      )}

      {!showList ? null : (
        <>
          <p className="mb-1 mt-6 px-1 text-xs text-faint" aria-live="polite">
            {results.length === songs.length
              ? `${songs.length} ${songs.length === 1 ? 'canzone' : 'canzoni'}`
              : `${results.length} di ${songs.length}`}
          </p>

          {results.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">Nessuna canzone trovata.</p>
          ) : (
            <ul className="row-list">
              {results.map((song) => {
                const canzoniere = nameOf(assignments[song.slug])

                return (
                  <li key={song.slug}>
                    <Link href={`/canzoni/${song.slug}`} className="row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{song.title}</span>
                        {(song.artist !== null || canzoniere !== null) && (
                          <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                            {song.artist}
                            {song.artist !== null && canzoniere !== null && (
                              <span className="text-faint"> · </span>
                            )}
                            {canzoniere !== null && (
                              <span className="text-faint">{canzoniere}</span>
                            )}
                          </span>
                        )}
                      </span>

                      {song.originalKey !== null && (
                        <span className="badge">
                          {formatKeyLabel(song.originalKey, global.notation)}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
