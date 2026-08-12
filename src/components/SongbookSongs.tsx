'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'

import { ArrangeSongbook } from '@/components/ArrangeSongbook'
import { useSongbooks } from '@/components/SongbookProvider'
import { useRole } from '@/components/RoleProvider'
import { SongRow } from '@/components/SongRow'
import { IconChevronDown, IconChevronRight, IconGrip } from '@/components/icons'
import { applyOrder } from '@/lib/songbooks/order'
import { useLiveRows } from '@/lib/library/useLiveSongs'
import type { SongIndexRow } from '@/lib/search-index'
import { type Folds, readFolds, songFromHash, writeFolds } from '@/lib/sections/folds'

/**
 * The songs of one songbook, under the section each belongs to.
 *
 * Which songs those are, and which section holds them, comes from the mutable layer
 * rather than from the page: a song moved since the last build belongs where it is now,
 * and the page it was baked into cannot know that. The order comes from the same query
 * the build used, so this list and the arrows inside a song agree about what "next"
 * means.
 *
 * Sections open and close, and they start **closed**: a songbook reads as an index of
 * its parts, and you open the part you need. Two exceptions keep that from being
 * annoying, and both give way to anything the reader has actually chosen:
 *
 * 1. a songbook with a single section opens it — a fold with one compartment is not a
 *    choice, and it is the state of every songbook until somebody divides it;
 * 2. arriving from a song opens the section that song is in, so the way back lands you
 *    where you were rather than in front of a closed list.
 *
 * Arranging is a mode rather than a handle on every row for the rest of the app's life,
 * because this is a list you read far more often than you rearrange.
 */
export function SongbookSongs({
  slug,
  songs: baked,
}: {
  slug: string
  songs: SongIndexRow[]
}) {
  const { assignments, online, divisionsOf } = useSongbooks()
  const { mayEdit } = useRole()

  const [rows, setRows] = useLiveRows(baked)
  const [organizing, setOrganizing] = useState(false)

  const [folds, setFolds] = useState<Folds>({})
  /** The song a link asked for, if one did. The *song*, not its section: see below. */
  const [asked, setAsked] = useState<string | null>(null)

  const divisions = useMemo(() => divisionsOf(slug), [divisionsOf, slug])

  /**
   * This songbook's songs, grouped by section, in the order the list holds them.
   *
   * Membership is asked of the mutable layer rather than of the rows, because that is
   * where the answer changes: a song can be moved into another section without its own
   * row changing at all. The rows arrive already ordered by section and then by place, so
   * filtering each section out of them keeps that order without sorting anything again.
   */
  const groups = useMemo<{ section: (typeof divisions)[number]; songs: SongIndexRow[] }[]>(
    () =>
      divisions.map((section) => ({
        section,
        songs: rows.filter((row) => assignments[row.slug] === section.id),
      })),
    [divisions, rows, assignments],
  )

  const total = useMemo(
    () => groups.reduce((count, group) => count + group.songs.length, 0),
    [groups],
  )

  /*
   * Both memories are read in a layout effect: reading them during render would produce
   * markup the server never sent and trip hydration, and reading them after paint would
   * show every section closed for a frame first. The hash is read here for the same
   * reason and at the same moment.
   */
  useLayoutEffect(() => {
    setFolds(readFolds(slug))
    setAsked(songFromHash(window.location.hash))
  }, [slug])

  /**
   * The section to open on arrival, worked out from the song rather than fixed when the
   * link was followed.
   *
   * It has to be derived, not stored: layout effects run child before parent, so at the
   * moment the hash is read the assignments are still the ones baked into the page — and
   * for a song moved since the last build that is the section it *used* to be in. Deriving
   * it means the right section opens as soon as the live answer lands, a beat later.
   */
  const arrived = asked === null ? null : (assignments[asked] ?? null)

  /** Closed unless the reader said otherwise, or one of the two exceptions applies. */
  const isOpen = useCallback(
    (id: number) => folds[String(id)] ?? (divisions.length === 1 || id === arrived),
    [folds, divisions.length, arrived],
  )

  const toggle = (id: number) => {
    const next = { ...folds, [String(id)]: !isOpen(id) }
    setFolds(next)
    writeFolds(slug, next)
  }

  // Bring the row you came back from into view, once the section holding it is open.
  useEffect(() => {
    if (arrived === null || asked === null) return

    document.getElementById(`song-${asked}`)?.scrollIntoView({ block: 'center' })
  }, [arrived, asked])

  if (organizing) {
    return (
      <ArrangeSongbook
        songbookSlug={slug}
        rows={rows}
        onDone={() => setOrganizing(false)}
        onApplied={(order) => setRows((current) => applyOrder(current, order))}
      />
    )
  }

  if (divisions.length === 0 && total === 0) {
    return <p className="panel p-3.5 text-sm text-muted">No songs in this songbook.</p>
  }

  return (
    <>
      {/*
        * How much is in here, counted from the live layer rather than from the page. The
        * static header above says only the name for that reason.
        */}
      <p className="mb-3 text-sm text-muted">
        {total} {total === 1 ? 'song' : 'songs'}
        {divisions.length > 1 && ` · ${divisions.length} sections`}
      </p>

      {/*
        * A card each. A section is a thing that opens and closes, with its own name and
        * its own songs, so it gets its own card rather than a hairline inside a shared
        * one — and a fold then has a visible container to happen in.
        */}
      <ul className="card-stack">
        {groups.map(({ section, songs }) => {
          const open = isOpen(section.id)

          return (
            <li key={section.id} className="card p-2">
              <button
                type="button"
                className="row w-full text-left"
                onClick={() => toggle(section.id)}
                aria-expanded={open}
              >
                {open ? (
                  <IconChevronDown size={18} className="text-faint" />
                ) : (
                  <IconChevronRight size={18} className="text-faint" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{section.name}</span>
                <span className="count-badge">{songs.length}</span>
              </button>

              {open &&
                (songs.length === 0 ? (
                  <p className="px-[0.875rem] pb-2 pt-1 text-sm text-muted">
                    No songs in this section.
                  </p>
                ) : (
                  <ul>
                    {songs.map((song) => (
                      // The id is what the way back from a song points at.
                      <li key={song.slug} id={`song-${song.slug}`}>
                        <SongRow song={song} />
                      </li>
                    ))}
                  </ul>
                ))}
            </li>
          )
        })}
      </ul>

      {/*
        * Only for someone whose songbook it is to arrange, and only with a network to
        * save it over. No minimum number of songs any more: with sections there is a
        * layout to change with one song — moving it to another section — and with none at
        * all, which is making the first division.
        */}
      {online && mayEdit && (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setOrganizing(true)}
          >
            <IconGrip size={16} />
            Arrange
          </button>
        </div>
      )}
    </>
  )
}
