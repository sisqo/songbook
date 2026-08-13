'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

import { PublishPanel } from '@/components/PublishPanel'
import { useSongbooks } from '@/components/SongbookProvider'
import { useRole } from '@/components/RoleProvider'
import { SongRow } from '@/components/SongRow'
import {
  IconChevronDown,
  IconChevronRight,
  IconOffline,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@/components/icons'
import { useLiveIndex } from '@/lib/library/useLiveSongs'
import { WRITE_MESSAGE, countBySlug, type WriteResult } from '@/lib/songbooks/types'
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
  const state = useSongbooks()
  const { songbooks, sections, assignments, nameOf, online } = state
  const { mayEdit } = useRole()

  const [songs] = useLiveIndex(baked)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  /*
   * Create, rename and remove, lifted here from the retired `/songbooks` page.
   *
   * Same fields, same wrapper, same rule about removal never destroying anything: a
   * songbook holding songs asks where to move them first, same as it did there. What
   * moved is only the page this lives on — the interaction itself is copied, not
   * reinvented, so an editor who knew the old screen needs nothing new to learn.
   */
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [destination, setDestination] = useState('')

  const run = async (action: () => Promise<WriteResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError(WRITE_MESSAGE[result.reason])
      return result.ok
    } catch {
      setError(WRITE_MESSAGE.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  const others = (slug: string) => songbooks.filter((entry) => entry.slug !== slug)

  /*
   * Counted from the songbook layer's own `assignments`, not from `groups` below.
   *
   * `groups[].count` comes from the live song index, refreshed on its own schedule; this
   * comes from the same `state` the remove action itself checks against. The two agree
   * almost always, but the moment they don't, this is the one that decides whether
   * "Remove" tries to delete a songbook that still holds something — and `on delete
   * restrict` is the guarantee either way, so a stale badge next to a correct decision
   * is a cosmetic gap, not a broken one.
   */
  const counts = countBySlug(state)

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
          {/*
            * Offline and error notices for the management block below, raised above both
            * the list and the empty state: a failed create shows up even with zero
            * songbooks, and "can only be viewed" is the reason the icons on every row
            * are about to be disabled, so it belongs before them, not after.
            */}
          {mayEdit && !online && (
            <p className="notice notice-accent mt-4">
              <IconOffline />
              Without a connection, songbooks can only be viewed. They&apos;re a shared structure,
              so changes require a connection.
            </p>
          )}

          {mayEdit && error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          {groups.length === 0 ? (
            /*
              * An empty library, said differently to the two people who can be looking at
              * it. Telling a viewer to create a songbook from a menu entry their role does
              * not draw would send them hunting for something that is not there — and the
              * action behind it would refuse them anyway. The editor's copy used to point
              * at a menu; now the create form is a few inches below, on this same screen.
              */
            <p className="mt-8 text-center text-sm text-muted">
              {mayEdit
                ? 'No songbook yet. Create one with the form below.'
                : 'No songbook yet. When one arrives, it will appear here.'}
            </p>
          ) : (
            <ul className="row-list card mt-4">
              {groups.map((group) => {
                const isRenaming = renaming === group.slug
                const isRemoving = removing === group.slug

                return (
                  <li key={group.slug}>
                    {/*
                      * Used to be one <Link> wrapping the whole row. An icon-button can't
                      * nest inside an <a>, so the link is now one flex child among others
                      * instead of the row itself — same href, same look, just no longer
                      * the element everything else lives inside of.
                      */}
                    <div className="flex items-center gap-1 pr-1">
                      {isRenaming ? (
                        <>
                          <input
                            autoFocus
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') setRenaming(null)
                            }}
                            aria-label={`New name for ${group.name}`}
                            className="form-field flex-1"
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy || draft.trim() === ''}
                            onClick={async () => {
                              if (await run(() => state.rename(group.slug, draft))) {
                                setRenaming(null)
                              }
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            onClick={() => setRenaming(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <Link href={`/songbooks/${group.slug}`} className="row min-w-0 flex-1">
                            <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                            <span className="count-badge">{group.count}</span>
                            <IconChevronRight size={18} className="text-faint" />
                          </Link>

                          {mayEdit && (
                            <>
                              <button
                                type="button"
                                className="icon-button"
                                disabled={!online || busy}
                                onClick={() => {
                                  setRenaming(group.slug)
                                  setDraft(group.name)
                                  setRemoving(null)
                                  setError(null)
                                }}
                                aria-label={`Rename ${group.name}`}
                              >
                                <IconPencil size={17} />
                              </button>
                              {/*
                                * Turns red when its own confirmation is open, so it is clear
                                * which row the question below the list belongs to.
                                */}
                              <button
                                type="button"
                                className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                                disabled={!online || busy}
                                onClick={() => {
                                  setRemoving(isRemoving ? null : group.slug)
                                  setDestination(others(group.slug)[0]?.slug ?? '')
                                  setRenaming(null)
                                  setError(null)
                                }}
                                aria-label={`Remove ${group.name}`}
                                aria-expanded={isRemoving}
                              >
                                <IconTrash size={17} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {isRemoving && (
                      <div className="panel mx-2 mb-2 p-3.5 text-sm">
                        {(() => {
                          const held = counts[group.slug] ?? 0

                          if (held === 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex-1">
                                  Remove &quot;{group.name}&quot;? It&apos;s empty.
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (await run(() => state.remove(group.slug, null))) {
                                      setRemoving(null)
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm"
                                  onClick={() => setRemoving(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                          }

                          if (others(group.slug).length === 0) {
                            return (
                              <span>
                                Contains {held} {held === 1 ? 'song' : 'songs'} and there&apos;s no
                                other songbook to move them to. Create one before removing this
                                one.
                              </span>
                            )
                          }

                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                Contains {held} {held === 1 ? 'song' : 'songs'}. Move them to:
                              </span>
                              <label className="picker picker-raised">
                                <span className="sr-only">Destination songbook</span>
                                <select
                                  value={destination}
                                  onChange={(event) => setDestination(event.target.value)}
                                  className="picker-select"
                                >
                                  {others(group.slug).map((entry) => (
                                    <option key={entry.slug} value={entry.slug}>
                                      {entry.name}
                                    </option>
                                  ))}
                                </select>
                                <IconChevronDown size={14} />
                              </label>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy || destination === ''}
                                onClick={async () => {
                                  if (await run(() => state.remove(group.slug, destination))) {
                                    setRemoving(null)
                                  }
                                }}
                              >
                                Move and remove
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setRemoving(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {mayEdit && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault()
                if (await run(() => state.create(newName))) setNewName('')
              }}
            >
              <label className="flex-1">
                <span className="sr-only">New songbook name</span>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="New songbook"
                  className="form-field min-h-12 rounded-pill px-[1.125rem]"
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary min-h-12 px-5"
                disabled={!online || busy || newName.trim() === ''}
              >
                <IconPlus size={16} />
                Create
              </button>
            </form>
          )}
        </>
      )}

      {/*
        * The console that used to sit at the bottom of `/import`. It has nothing to do
        * with any one songbook, so unlike everything above it does not go away while
        * searching — a publish already running keeps its own state (the pending list,
        * the "Publishing…" watch) regardless of what the search box holds, and losing
        * that state mid-wait would leave a rebuild running with no way to tell.
        */}
      {mayEdit && <PublishPanel />}
    </div>
  )
}
