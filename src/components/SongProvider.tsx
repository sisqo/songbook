'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { type ParsedSong, parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data/types'
import { deleteSong, saveSong } from '@/lib/import/actions'
import type { Decision, DeleteResult, SaveResult, SongInput } from '@/lib/import/types'
import { loadSongContent } from '@/lib/library/actions'
import { isNewer, pick } from '@/lib/library/overlay'
import { dropEdit, readEdit, writeEdit } from '@/lib/library/store'

interface SongContextValue {
  /** The newest version this browser knows about. */
  song: Song
  parsed: ParsedSong
  /** True only once the server has said this song no longer exists. */
  deleted: boolean
  save: (input: SongInput, decision?: Decision) => Promise<SaveResult>
  remove: () => Promise<DeleteResult>
}

const SongContext = createContext<SongContextValue | null>(null)

/**
 * Holds the song being read, which is not always the one the page was built from.
 *
 * Song pages are generated at build time and precached, so an edit saved between
 * two deploys exists only in the database. Before this, saving looked like losing:
 * the sheet did not change, and reopening the form showed the old words back
 * again, because the form was filled from the page rather than from the database.
 *
 * Three sources, in this order, each only if it is genuinely newer than the last:
 * the copy baked into the page, the copy this browser cached the last time it
 * learned of an edit, then the database. And a save applies its own result
 * straight away, which is what makes the sheet change under your hands.
 *
 * "Newer" is always measured against the baked copy — never against the cache, and
 * never against a clock in the browser. That is what lets the cached edit survive
 * exactly as long as it is needed: it keeps showing through the whole deploy that
 * is busy baking it in, and stops the moment the new page arrives carrying it.
 *
 * The provider is keyed by slug where it is used, so stepping to the next song
 * cannot leave the previous song's state behind.
 */
export function SongProvider({
  baked,
  bakedParsed,
  children,
}: {
  /** The song as the page was generated. */
  baked: Song
  /** Parsed once on the server, so the common case parses nothing in the browser. */
  bakedParsed: ParsedSong
  children: ReactNode
}) {
  const [song, setSong] = useState<Song>(baked)
  const [deleted, setDeleted] = useState(false)
  const { refresh: refreshCanzonieri } = useCanzonieri()

  /**
   * Reading the cache in a layout effect rather than in render: render has to
   * match the server's markup or hydration breaks, and this still lands before
   * the browser paints.
   */
  useLayoutEffect(() => {
    const cached = readEdit(baked.slug)
    if (cached === null) return

    if (isNewer(cached, baked)) setSong(cached)
    else dropEdit(baked.slug)
  }, [baked])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    let alive = true

    void (async () => {
      try {
        const result = await loadSongContent(baked.slug)
        if (!alive) return

        // Says nothing about the song: keep the page and the cache as they are.
        if (result.state === 'unavailable') return

        if (result.state === 'missing') {
          setDeleted(true)
          dropEdit(baked.slug)
          return
        }

        if (isNewer(result.song, baked)) {
          setSong(result.song)
          writeEdit(result.song)
        } else {
          // The build has caught up: the page itself is current again.
          setSong(baked)
          dropEdit(baked.slug)
        }
      } catch {
        // No answer, which is the normal state offline.
      }
    })()

    return () => {
      alive = false
    }
  }, [baked])

  /**
   * Parsing only happens in the browser when there is something new to parse. A
   * page shown as it was built reuses the parse the server already did.
   */
  const parsed = useMemo(
    () => (song.body === baked.body ? bakedParsed : parseChordPro(song.body)),
    [song.body, baked.body, bakedParsed],
  )

  const save = useCallback(
    async (input: SongInput, decision?: Decision) => {
      const result = await saveSong(input, decision)
      if (!result.ok) return result

      setSong(pick(baked, result.song))
      if (isNewer(result.song, baked)) writeEdit(result.song)
      else dropEdit(baked.slug)

      // A save can move the song to another canzoniere, and the header says which.
      void refreshCanzonieri()

      return result
    },
    [baked, refreshCanzonieri],
  )

  const remove = useCallback(async () => {
    const result = await deleteSong(baked.slug)
    if (result.ok) dropEdit(baked.slug)
    return result
  }, [baked.slug])

  const value = useMemo<SongContextValue>(
    () => ({ song, parsed, deleted, save, remove }),
    [song, parsed, deleted, save, remove],
  )

  return <SongContext.Provider value={value}>{children}</SongContext.Provider>
}

export function useSong(): SongContextValue {
  const context = useContext(SongContext)
  if (context === null) {
    throw new Error('useSong must be used inside a SongProvider')
  }
  return context
}
