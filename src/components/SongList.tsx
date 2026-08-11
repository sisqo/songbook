'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { usePrefs } from '@/components/PrefsProvider'
import { IconChevronDown, IconSearch } from '@/components/icons'
import { loadSongIndex } from '@/lib/library/actions'
import { mergeIndex } from '@/lib/library/overlay'
import { formatKey } from '@/lib/music/chord'
import { parseKey } from '@/lib/music/notes'
import type { SongIndexEntry } from '@/lib/search-index'

/**
 * The key a song is grouped under. Songs with no canzoniere share the empty
 * string, which no real slug can be, so they group together instead of vanishing.
 */
const UNGROUPED = ''

/** Shows the song's own key in the reader's notation, or as written if unparseable. */
function formatKeyLabel(raw: string, notation: 'it' | 'int'): string {
  const key = parseKey(raw)
  return key === null ? raw : formatKey(key, notation)
}

/**
 * The canzonieri, and their songs one level down.
 *
 * The home page lists no songs until you ask for some: opening a canzoniere shows
 * what is in it, and searching shows matches across everything. Both stay on this
 * one page, which is the only way they could work offline — a route per canzoniere
 * would not exist among the pages generated at build time.
 *
 * Which canzoniere is open is mirrored into `?c=` with `history.replaceState`
 * rather than through `useSearchParams` and a router push: reading search params
 * through the Next hook would opt this page out of static rendering, and the page
 * has to stay static to be precached. That is also what makes the back button
 * return to an open canzoniere instead of a closed one, and why `c` belongs in
 * Serwist's `ignoreURLParametersMatching`.
 *
 * The list the build baked in is only the starting point: what the database holds
 * now is laid over it on mount, so a song imported or renamed since the last
 * publish is not missing from the one screen whose job is finding songs.
 */
export function SongList({ songs: baked }: { songs: SongIndexEntry[] }) {
  const { global } = usePrefs()
  const { canzonieri, assignments, nameOf } = useCanzonieri()

  const [songs, setSongs] = useState(baked)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const deferred = useDeferredValue(query)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('c')
    if (fromUrl !== null) setOpen(fromUrl)
  }, [])

  /**
   * What the database holds now, over the list the build baked in: a song
   * imported since then gets a row, a deleted one loses it, and a retitled one
   * shows its new title.
   *
   * Nothing is cached. A row here is a promise that tapping it opens something,
   * and a song added since the last build has no page in the precache to open —
   * so when the server cannot be reached, the list stays as the build left it,
   * where every row leads somewhere.
   */
  useEffect(() => {
    let alive = true

    void (async () => {
      try {
        const live = await loadSongIndex()
        if (alive && live !== null) setSongs(mergeIndex(baked, live))
      } catch {
        // Offline or signed out: the baked list still stands.
      }
    })()

    return () => {
      alive = false
    }
  }, [baked])

  const toggle = (key: string) => {
    const next = open === key ? null : key
    setOpen(next)

    const url = new URL(window.location.href)
    if (next === null) url.searchParams.delete('c')
    else url.searchParams.set('c', next)
    window.history.replaceState(null, '', url)
  }

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    const terms = needle === '' ? [] : needle.split(/\s+/)

    // Every term must appear somewhere, so "certe notti" and "notti certe" match.
    return songs.filter((song) => terms.every((term) => song.haystack.includes(term)))
  }, [songs, deferred])

  /**
   * The groups, in the order the canzonieri come in, with anything unfiled last.
   * A database with no canzonieri at all still gets one group, or this page would
   * be a search box and nothing else.
   */
  const groups = useMemo(() => {
    const songsOf = (key: string) =>
      songs.filter((song) => (assignments[song.slug] ?? UNGROUPED) === key)

    const named = canzonieri.map((canzoniere) => ({
      key: canzoniere.slug,
      name: canzoniere.name,
      songs: songsOf(canzoniere.slug),
    }))

    const unfiled = songsOf(UNGROUPED)
    if (unfiled.length === 0) return named

    return [
      ...named,
      {
        key: UNGROUPED,
        name: canzonieri.length === 0 ? 'Tutte le canzoni' : 'Senza canzoniere',
        songs: unfiled,
      },
    ]
  }, [songs, canzonieri, assignments])

  const searching = deferred.trim() !== ''

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

      {searching ? (
        <>
          <p className="mb-1 mt-6 px-1 text-xs text-faint" aria-live="polite">
            {`${results.length} di ${songs.length}`}
          </p>

          {results.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">Nessuna canzone trovata.</p>
          ) : (
            <ul className="row-list card">
              {results.map((song) => (
                <li key={song.slug}>
                  <SongRow
                    song={song}
                    notation={global.notation}
                    under={nameOf(assignments[song.slug])}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <ul className="row-list card mt-5">
          {groups.map((group) => {
            const isOpen = open === group.key

            return (
              <li key={group.key}>
                <button
                  type="button"
                  className="row w-full text-start"
                  aria-expanded={isOpen}
                  onClick={() => toggle(group.key)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                  <span className="count-badge">{group.songs.length}</span>
                  <IconChevronDown
                    size={18}
                    className={isOpen ? 'text-faint rotate-180' : 'text-faint'}
                  />
                </button>

                {isOpen &&
                  (group.songs.length === 0 ? (
                    <p className="px-3 pb-3 text-sm text-muted">
                      Nessun brano in questo canzoniere.
                    </p>
                  ) : (
                    <ul className="pb-1">
                      {group.songs.map((song) => (
                        <li key={song.slug}>
                          <SongRow song={song} notation={global.notation} nested />
                        </li>
                      ))}
                    </ul>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SongRow({
  song,
  notation,
  under,
  nested = false,
}: {
  song: SongIndexEntry
  notation: 'it' | 'int'
  /** A second line under the title, used by search results to say where a song lives. */
  under?: string | null
  nested?: boolean
}) {
  return (
    <Link href={`/canzoni/${song.slug}`} className={nested ? 'row row-nested' : 'row'}>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{song.title}</span>
        {(song.artist !== null || (under !== undefined && under !== null)) && (
          <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
            {song.artist}
            {song.artist !== null && under !== undefined && under !== null && (
              <span className="text-faint"> · </span>
            )}
            {under !== undefined && under !== null && <span className="text-faint">{under}</span>}
          </span>
        )}
      </span>

      {song.originalKey !== null && (
        <span className="badge">{formatKeyLabel(song.originalKey, notation)}</span>
      )}
    </Link>
  )
}
