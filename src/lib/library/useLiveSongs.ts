'use client'

import { useEffect, useRef, useState } from 'react'

import { loadSongIndex } from './actions'
import { mergeIndex } from './overlay'
import type { SongIndexEntry, SongIndexRow } from '../search-index'

/**
 * What the database holds now, over the list the build baked in.
 *
 * Every screen that lists songs needs this and needs it to behave the same way, which
 * is why it is one hook and not an effect copied three times: the home, a songbook,
 * and whatever lists songs next.
 *
 * Nothing is cached. A row here is a promise that tapping it opens something, and a
 * song added since the last build has no page in the precache to open — so when the
 * server cannot be reached, the list stays as the build left it, where every row leads
 * somewhere.
 *
 * The setter is returned because a list is not only refreshed from the server: dragging
 * a song into another place rearranges it locally the moment the order is saved.
 */
function useLive<T extends SongIndexRow>(
  baked: T[],
  adopt: (live: SongIndexRow[]) => T[],
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [rows, setRows] = useState(baked)

  /*
   * Held in a ref rather than passed through the dependencies: `adopt` is written
   * inline by the caller, so it is a new function on every render, and depending on it
   * would fetch the whole list again on every render. What decides whether to ask again
   * is the baked list changing, which only happens on a new page.
   */
  const adoptRef = useRef(adopt)
  adoptRef.current = adopt

  useEffect(() => {
    let alive = true

    void (async () => {
      try {
        const live = await loadSongIndex()
        if (alive && live !== null) setRows(adoptRef.current(live))
      } catch {
        // Offline or signed out: the baked list still stands.
      }
    })()

    return () => {
      alive = false
    }
  }, [baked])

  return [rows, setRows]
}

/**
 * The searchable list: rows refreshed from the database, lyrics kept from the build.
 *
 * A song the build already had keeps its baked haystack, because the words in there
 * are the ones this browser can actually show — see `mergeIndex`.
 */
export function useLiveIndex(
  baked: SongIndexEntry[],
): [SongIndexEntry[], React.Dispatch<React.SetStateAction<SongIndexEntry[]>>] {
  return useLive(baked, (live) => mergeIndex(baked, live))
}

/**
 * Every song as the database has them, for a screen that shows some of them.
 *
 * No merge: with nothing to search there is nothing in the baked row worth keeping over
 * the live one. The caller filters — which songbook a song is in is the mutable layer's
 * answer, not this list's.
 */
export function useLiveRows(
  baked: SongIndexRow[],
): [SongIndexRow[], React.Dispatch<React.SetStateAction<SongIndexRow[]>>] {
  return useLive(baked, (live) => live)
}
