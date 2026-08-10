'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { usePrefs } from '@/components/PrefsProvider'
import { IconSearch } from '@/components/icons'
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
 * The song list with instant search and a canzoniere filter.
 *
 * The index travels with the page rather than being fetched, so searching costs
 * no network at all and keeps working offline — which for a precached page is the
 * only way it could work. Search always covers every song: the filter narrows
 * what is listed, not what is searched.
 *
 * The selected canzoniere is mirrored into `?c=` with `history.replaceState`
 * rather than `useSearchParams` and a router push. Reading search params through
 * the Next hook would opt this page out of static rendering, and the page has to
 * stay static to be precached.
 */
export function SongList({ songs }: { songs: SongIndexEntry[] }) {
  const { global } = usePrefs()
  const { canzonieri, assignments, nameOf } = useCanzonieri()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const deferred = useDeferredValue(query)

  // Read the initial selection from the URL so a filtered link is shareable.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('c')
    if (fromUrl !== null) setSelected(fromUrl)
  }, [])

  const choose = (slug: string | null) => {
    setSelected(slug)

    const url = new URL(window.location.href)
    if (slug === null) url.searchParams.delete('c')
    else url.searchParams.set('c', slug)
    window.history.replaceState(null, '', url)
  }

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()

    const terms = needle === '' ? [] : needle.split(/\s+/)
    return songs.filter((song) => {
      if (selected !== null && assignments[song.slug] !== selected) return false
      // Every term must appear somewhere, so "certe notti" and "notti certe" match.
      return terms.every((term) => song.haystack.includes(term))
    })
  }, [songs, deferred, selected, assignments])

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

      {canzonieri.length > 1 && (
        <div className="chip-row mt-3" role="group" aria-label="Filtra per canzoniere">
          <button
            type="button"
            className={selected === null ? 'chip is-on' : 'chip'}
            aria-pressed={selected === null}
            onClick={() => choose(null)}
          >
            Tutti
          </button>
          {canzonieri.map((canzoniere) => (
            <button
              key={canzoniere.slug}
              type="button"
              className={selected === canzoniere.slug ? 'chip is-on' : 'chip'}
              aria-pressed={selected === canzoniere.slug}
              onClick={() => choose(canzoniere.slug)}
            >
              {canzoniere.name}
            </button>
          ))}
        </div>
      )}

      <p className="mb-1 mt-4 px-1 text-xs text-faint" aria-live="polite">
        {results.length === songs.length
          ? `${songs.length} ${songs.length === 1 ? 'canzone' : 'canzoni'}`
          : `${results.length} di ${songs.length}`}
      </p>

      {results.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">Nessuna canzone trovata.</p>
      ) : (
        <ul className="row-list">
          {results.map((song) => {
            const canzoniere = selected === null ? nameOf(assignments[song.slug]) : null

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
                        {canzoniere !== null && <span className="text-faint">{canzoniere}</span>}
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
    </div>
  )
}
