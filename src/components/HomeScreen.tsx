'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import { useRole } from '@/components/RoleProvider'
import { SongRow } from '@/components/SongRow'
import { IconChevronRight, IconSearch } from '@/components/icons'
import { useLiveIndex } from '@/lib/library/useLiveSongs'
import type { SongIndexEntry } from '@/lib/search-index'

/**
 * The first screen: the songbooks, and a way to search across all of them.
 *
 * A songbook is a link, not a drawer. It used to open in place, and the list of songs
 * appeared underneath — which meant the one thing this screen is for, choosing a
 * songbook, left you still on this screen with your songs in a fold. Now it leads to
 * the songbook's own page: one destination per tap, a back button that means
 * something, and a URL that can be shared and precached.
 *
 * Searching is the exception and stays here, because a search is not about one
 * songbook. It replaces the list with matches from everywhere, each saying where it
 * lives, and the list comes back when the box is emptied.
 */
export function HomeScreen({ songs: baked }: { songs: SongIndexEntry[] }) {
  const { songbooks, sections, assignments, nameOf } = useSongbooks()
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
     * Alphabetical, whatever order the songbooks are in.
     *
     * Inside a songbook the saved order is the point; across songbooks it is not an
     * order at all — matches would arrive as every songbook's first song, then every
     * second, which is nobody's idea of a result list.
     */
    return [...found].sort((one, other) => one.title.localeCompare(other.title, 'it'))
  }, [songs, deferred])

  /**
   * Which songbook each song is in, by way of its section.
   *
   * A map rather than a walk per song: the answer is two lookups, and this screen asks
   * it once per song for the counts and again for every search result.
   */
  const homeOf = useMemo(() => {
    const songbookById = new Map(
      sections.map((section) => [section.id, section.songbookSlug]),
    )
    return (slug: string) => songbookById.get(assignments[slug] ?? -1) ?? null
  }, [sections, assignments])

  /**
   * The songbooks with their counts.
   *
   * There used to be a group of unfiled songs after them, for songs whose songbook was
   * null. That state no longer exists — the column is `not null`, and a song's songbook
   * now comes from its section — so the group went with it rather than being carried
   * around as a case nobody would ever see.
   */
  const groups = useMemo(
    () =>
      songbooks.map((songbook) => ({
        slug: songbook.slug,
        name: songbook.name,
        count: songs.filter((song) => homeOf(song.slug) === songbook.slug).length,
      })),
    [songs, songbooks, homeOf],
  )

  const searching = deferred.trim() !== ''

  return (
    <div>
      <label className="search-field block">
        <span className="sr-only">Search songs</span>
        <IconSearch />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, artist, or lyrics"
          autoComplete="off"
          className="form-field"
        />
      </label>

      {searching ? (
        <>
          <p className="mb-1 mt-6 px-1 text-xs text-faint" aria-live="polite">
            {`${results.length} of ${songs.length}`}
          </p>

          {results.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">No songs found.</p>
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
              * it. Telling a viewer to create a songbook from a menu entry their role does
              * not draw would send them hunting for something that is not there — and the
              * action behind it would refuse them anyway.
              */
            <p className="mt-8 text-center text-sm text-muted">
              {mayEdit
                ? 'No songbook. Create one from the menu, under Songbooks.'
                : 'No songbook yet. When one arrives, it will appear here.'}
            </p>
          ) : (
            <ul className="row-list card mt-4">
              {groups.map((group) => (
                <li key={group.slug}>
                  <Link href={`/songbooks/${group.slug}`} className="row">
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
