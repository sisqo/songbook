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
import type { Instrument } from '@/lib/music/shapes'
import { loadPrefs, saveGlobalPrefs, saveSongPrefs } from '@/lib/prefs/actions'
import { prefsQueue } from '@/lib/prefs/queue'
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
  clampCapo,
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
  setInstrument: (instrument: Instrument) => void
  setSemitones: (semitones: number) => void
  setScrollSpeed: (step: number) => void
  setCapo: (fret: number) => void
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
  persist = true,
  children,
}: {
  /** Null on pages that show no single song, such as the index. */
  songSlug: string | null
  /**
   * False for Sing Together's guest view: a reader with no account of their own,
   * remounted fresh for every song it follows. There is nothing of theirs to load and
   * nothing to remember between songs — and, if the browser showing the link happens to
   * also be signed in, nothing that may end up saved under that real account instead.
   * State lives only in memory, gone the moment this provider unmounts.
   */
  persist?: boolean
  children: ReactNode
}) {
  const [global, setGlobal] = useState<GlobalPrefs>(DEFAULT_GLOBAL_PREFS)
  const [song, setSong] = useState<SongPrefs>(DEFAULT_SONG_PREFS)
  const [pending, setPending] = useState(0)

  useLayoutEffect(() => {
    if (!persist) return
    setGlobal(readGlobalPrefs())
    setSong(songSlug === null ? DEFAULT_SONG_PREFS : readSongPrefs(songSlug))
  }, [songSlug, persist])

  useEffect(() => {
    if (!persist) return
    prefsQueue.setHandlers({ saveGlobal: saveGlobalPrefs, saveSong: saveSongPrefs })
    prefsQueue.watchConnection()
    return prefsQueue.subscribe(setPending)
  }, [persist])

  useEffect(() => {
    if (!persist) return
    let cancelled = false

    loadPrefs(songSlug)
      .then((stored) => {
        if (cancelled) return

        if (stored.global !== null && !prefsQueue.hasPending('global')) {
          setGlobal(stored.global)
          writeGlobalPrefs(stored.global)
        }
        if (stored.song !== null && songSlug !== null && !prefsQueue.hasPending(`song:${songSlug}`)) {
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
  }, [songSlug, persist])

  /*
   * Setting a preference to the value it already has is not a change, and saying so
   * here rather than at each call site is what keeps the queue honest: it would
   * otherwise send the server a write it does not need and light the unsaved dot for
   * nothing.
   *
   * Reachable since the reading panel replaced the notation toggle with a pair of
   * buttons. A toggle could only ever be called with the other value; "Do" can be
   * pressed while the notation is already Do.
   */
  const updateGlobal = useCallback(
    (next: GlobalPrefs) => {
      if (
        next.zoomStep === global.zoomStep &&
        next.notation === global.notation &&
        next.instrument === global.instrument
      ) {
        return
      }

      setGlobal(next)
      if (!persist) return
      writeGlobalPrefs(next)
      prefsQueue.enqueueGlobal(next)
    },
    [global, persist],
  )

  const updateSong = useCallback(
    (next: SongPrefs) => {
      if (
        next.semitones === song.semitones &&
        next.scrollSpeed === song.scrollSpeed &&
        next.capo === song.capo
      ) {
        return
      }

      setSong(next)
      if (!persist || songSlug === null) return
      writeSongPrefs(songSlug, next)
      prefsQueue.enqueueSong(songSlug, next)
    },
    [song, songSlug, persist],
  )

  const value = useMemo<PrefsContextValue>(
    () => ({
      global,
      song,
      pending,
      setZoomStep: (step) => updateGlobal({ ...global, zoomStep: clampZoom(step) }),
      setNotation: (notation) => updateGlobal({ ...global, notation }),
      setInstrument: (instrument) => updateGlobal({ ...global, instrument }),
      setSemitones: (semitones) => updateSong({ ...song, semitones: clampSemitones(semitones) }),
      setScrollSpeed: (step) => updateSong({ ...song, scrollSpeed: clampSpeed(step) }),
      setCapo: (fret) => updateSong({ ...song, capo: clampCapo(fret) }),
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
