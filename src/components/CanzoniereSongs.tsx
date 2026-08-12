'use client'

import { useMemo, useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { ReorderSongs } from '@/components/ReorderSongs'
import { SongRow } from '@/components/SongRow'
import { IconGrip } from '@/components/icons'
import { applyOrder } from '@/lib/canzonieri/order'
import { useLiveRows } from '@/lib/library/useLiveSongs'
import type { SongIndexRow } from '@/lib/search-index'

/**
 * The songs of one canzoniere, in the order they are played in.
 *
 * Which songs those are comes from the mutable layer rather than from the page: a song
 * moved into this canzoniere since the last build belongs here now, and the page it was
 * baked into cannot know that. The order comes from the same query the build used, so
 * the list and the arrows inside a song agree about what "next" means.
 *
 * Arranging is a mode rather than a handle on every row for the rest of the app's life,
 * because this is a list you read far more often than you rearrange.
 */
export function CanzoniereSongs({
  slug,
  songs: baked,
}: {
  slug: string
  songs: SongIndexRow[]
}) {
  const { assignments, online } = useCanzonieri()

  const [rows, setRows] = useLiveRows(baked)
  const [ordering, setOrdering] = useState(false)

  /*
   * The live list holds every song; these are the ones filed here.
   *
   * Membership is asked of the mutable layer rather than of the rows, because that is
   * where the answer changes: a song can be moved into this canzoniere without its own
   * row changing at all. The page bakes a snapshot of both, so the first paint is
   * already right and neither list waits for the other.
   */
  const songs = useMemo(
    () => rows.filter((row) => assignments[row.slug] === slug),
    [rows, assignments, slug],
  )

  if (songs.length === 0) {
    return <p className="panel p-3.5 text-sm text-muted">Nessun brano in questo canzoniere.</p>
  }

  if (ordering) {
    return (
      <div className="card pt-2.5">
        <ReorderSongs
          songs={songs}
          canzoniereSlug={slug}
          onApplied={(order) => setRows((current) => applyOrder(current, order))}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[1.125rem] pb-4">
          <button type="button" className="btn btn-sm" onClick={() => setOrdering(false)}>
            Fatto
          </button>
          {/*
            * The order is this list's own, and it is saved as soon as a row lands. What
            * waits for a rebuild is the pair of arrows inside a song, which come from
            * the pages themselves.
            */}
          <span className="text-xs text-faint">
            Salvato subito. Le frecce dentro il brano lo seguono dopo la prossima
            ricostruzione.
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <ul className="row-list card">
        {songs.map((song) => (
          <li key={song.slug}>
            <SongRow song={song} />
          </li>
        ))}
      </ul>

      {/*
        * Only where there is an order to change: two songs at least, and a network to
        * save it over.
        */}
      {songs.length > 1 && online && (
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setOrdering(true)}
          >
            <IconGrip size={16} />
            Riordina
          </button>
        </div>
      )}
    </>
  )
}
