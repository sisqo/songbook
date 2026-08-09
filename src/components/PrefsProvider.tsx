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

import type { Notation } from '@/lib/music/chord'
import { loadPrefs, saveGlobalPrefs, saveSongPrefs } from '@/lib/prefs/actions'
import {
  enqueueGlobal,
  enqueueSong,
  hasPending,
  setQueueHandlers,
  subscribeToQueue,
  watchConnection,
} from '@/lib/prefs/queue'
import {
  readGlobalPrefs,
  readSongPrefs,
  writeGlobalPrefs,
  writeSongPrefs,
} from '@/lib/prefs/store'
import {
  DEFAULT_GLOBAL_PREFS,
  DEFAULT_SONG_PREFS,
  type GlobalPrefs,
  type SongPrefs,
  clampSemitones,
  clampSpeed,
  clampZoom,
} from '@/lib/prefs/types'

interface PrefsContextValue {
  global: GlobalPrefs
  song: SongPrefs
  /** Number of changes not yet saved to the server. */
  pending: number
  setZoomStep: (step: number) => void
  setNotation: (notation: Notation) => void
  setSemitones: (semitones: number) => void
  setScrollSpeed: (step: number) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

/**
 * Holds the reader's preferences for the page.
 *
 * Three layers, in the order they run:
 *
 * 1. The local cache is read in a layout effect — before paint, so the sheet
 *    never appears in the wrong key, and not during render, which would make the
 *    server and client markup differ and trip a hydration error.
 * 2. The server's values arrive after mount and win, because the database is the
 *    source of truth — except where a change is still queued, which would
 *    otherwise be silently overwritten by the older stored value.
 * 3. Changes are written to the cache and queued for the server.
 */
export function PrefsProvider({
  songSlug,
  children,
}: {
  /** Null on pages that show no single song, such as the index. */
  songSlug: string | null
  children: ReactNode
}) {
  const [global, setGlobal] = useState<GlobalPrefs>(DEFAULT_GLOBAL_PREFS)
  const [song, setSong] = useState<SongPrefs>(DEFAULT_SONG_PREFS)
  const [pending, setPending] = useState(0)

  useLayoutEffect(() => {
    setGlobal(readGlobalPrefs())
    setSong(songSlug === null ? DEFAULT_SONG_PREFS : readSongPrefs(songSlug))
  }, [songSlug])

  useEffect(() => {
    setQueueHandlers({ saveGlobal: saveGlobalPrefs, saveSong: saveSongPrefs })
    watchConnection()
    return subscribeToQueue(setPending)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadPrefs(songSlug)
      .then((stored) => {
        if (cancelled) return

        if (stored.global !== null && !hasPending('global')) {
          setGlobal(stored.global)
          writeGlobalPrefs(stored.global)
        }
        if (stored.song !== null && songSlug !== null && !hasPending(`song:${songSlug}`)) {
          setSong(stored.song)
          writeSongPrefs(songSlug, stored.song)
        }
      })
      .catch(() => {
        // Offline or signed out: the cache already gave us something to read.
      })

    return () => {
      cancelled = true
    }
  }, [songSlug])

  const updateGlobal = useCallback((next: GlobalPrefs) => {
    setGlobal(next)
    writeGlobalPrefs(next)
    enqueueGlobal(next)
  }, [])

  const updateSong = useCallback(
    (next: SongPrefs) => {
      setSong(next)
      if (songSlug === null) return
      writeSongPrefs(songSlug, next)
      enqueueSong(songSlug, next)
    },
    [songSlug],
  )

  const value = useMemo<PrefsContextValue>(
    () => ({
      global,
      song,
      pending,
      setZoomStep: (step) => updateGlobal({ ...global, zoomStep: clampZoom(step) }),
      setNotation: (notation) => updateGlobal({ ...global, notation }),
      setSemitones: (semitones) => updateSong({ ...song, semitones: clampSemitones(semitones) }),
      setScrollSpeed: (step) => updateSong({ ...song, scrollSpeed: clampSpeed(step) }),
    }),
    [global, song, pending, updateGlobal, updateSong],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const context = useContext(PrefsContext)
  if (context === null) {
    throw new Error('usePrefs must be used inside a PrefsProvider')
  }
  return context
}
