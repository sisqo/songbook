'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { useRole } from '@/components/RoleProvider'
import { SongRow } from '@/components/SongRow'
import { IconChevronRight, IconSearch } from '@/components/icons'
import { useLiveIndex } from '@/lib/library/useLiveSongs'
import type { SongIndexEntry } from '@/lib/search-index'

/**
 * The first screen: the canzonieri, and a way to search across all of them.
 *
 * A canzoniere is a link, not a drawer. It used to open in place, and the list of songs
 * appeared underneath — which meant the one thing this screen is for, choosing a
 * canzoniere, left you still on this screen with your songs in a fold. Now it leads to
 * the canzoniere's own page: one destination per tap, a back button that means
 * something, and a URL that can be shared and precached.
 *
 * Searching is the exception and stays here, because a search is not about one
 * canzoniere. It replaces the list with matches from everywhere, each saying where it
 * lives, and the list comes back when the box is emptied.
 */
export function HomeScreen({ songs: baked }: { songs: SongIndexEntry[] }) {
  const { canzonieri, sections, assignments, nameOf } = useCanzonieri()
  const { mayEdit } = useRole()

  const [songs] = useLiveIndex(baked)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase()
    if (needle === '') return []

    // Every term must appear somewhere, so "certe notti" and "notti certe" match.
    const terms = needle.split(/\s+/)
    const found = songs.filter((song) => terms.every((term) => song.haystack.includes(term)))

    /*
     * Alphabetical, whatever order the canzonieri are in.
     *
     * Inside a canzoniere the saved order is the point; across canzonieri it is not an
     * order at all — matches would arrive as every canzoniere's first song, then every
     * second, which is nobody's idea of a result list.
     */
    return [...found].sort((one, other) => one.title.localeCompare(other.title, 'it'))
  }, [songs, deferred])

  /**
   * Which canzoniere each song is in, by way of its section.
   *
   * A map rather than a walk per song: the answer is two lookups, and this screen asks
   * it once per song for the counts and again for every search result.
   */
  const homeOf = useMemo(() => {
    const canzoniereById = new Map(
      sections.map((section) => [section.id, section.canzoniereSlug]),
    )
    return (slug: string) => canzoniereById.get(assignments[slug] ?? -1) ?? null
  }, [sections, assignments])

  /**
   * The canzonieri with their counts.
   *
   * There used to be a group of unfiled songs after them, for songs whose canzoniere was
   * null. That state no longer exists — the column is `not null`, and a song's canzoniere
   * now comes from its section — so the group went with it rather than being carried
   * around as a case nobody would ever see.
   */
  const groups = useMemo(
    () =>
      canzonieri.map((canzoniere) => ({
        slug: canzoniere.slug,
        name: canzoniere.name,
        count: songs.filter((song) => homeOf(song.slug) === canzoniere.slug).length,
      })),
    [songs, canzonieri, homeOf],
  )

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
            /* Matches from anywhere belong to each other, so they share one card. */
            <ul className="row-list card">
              {results.map((song) => (
                <li key={song.slug}>
                  <SongRow song={song} under={nameOf(homeOf(song.slug))} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {groups.length === 0 ? (
            /*
              * An empty library, said differently to the two people who can be looking at
              * it. Telling a viewer to create a canzoniere from a menu entry their role does
              * not draw would send them hunting for something that is not there — and the
              * action behind it would refuse them anyway.
              */
            <p className="mt-8 text-center text-sm text-muted">
              {mayEdit
                ? 'Nessun canzoniere. Creane uno dal menu, alla voce Canzonieri.'
                : 'Nessun canzoniere, per ora. Quando ne arriva uno compare qui.'}
            </p>
          ) : (
            <ul className="row-list card mt-4">
              {groups.map((group) => (
                <li key={group.slug}>
                  <Link href={`/canzonieri/${group.slug}`} className="row">
                    <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                    <span className="count-badge">{group.count}</span>
                    <IconChevronRight size={18} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

        </>
      )}
    </div>
  )
}
