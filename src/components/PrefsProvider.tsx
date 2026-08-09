'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import type { Notation } from '@/lib/music/chord'
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
  /** True once the cache has been read, so the UI can avoid announcing defaults. */
  ready: boolean
  setZoomStep: (step: number) => void
  setNotation: (notation: Notation) => void
  setSemitones: (semitones: number) => void
  setScrollSpeed: (step: number) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

/**
 * Holds the reader's preferences for the page.
 *
 * The cache is read in a layout effect rather than during render: reading
 * localStorage while rendering would make the server and client markup differ
 * and React would throw a hydration error. A layout effect still runs before
 * the browser paints, so the sheet never appears in the wrong key.
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
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    setGlobal(readGlobalPrefs())
    setSong(songSlug === null ? DEFAULT_SONG_PREFS : readSongPrefs(songSlug))
    setReady(true)
  }, [songSlug])

  const updateGlobal = useCallback((next: GlobalPrefs) => {
    setGlobal(next)
    writeGlobalPrefs(next)
  }, [])

  const updateSong = useCallback(
    (next: SongPrefs) => {
      setSong(next)
      if (songSlug !== null) writeSongPrefs(songSlug, next)
    },
    [songSlug],
  )

  const value = useMemo<PrefsContextValue>(
    () => ({
      global,
      song,
      ready,
      setZoomStep: (step) => updateGlobal({ ...global, zoomStep: clampZoom(step) }),
      setNotation: (notation) => updateGlobal({ ...global, notation }),
      setSemitones: (semitones) => updateSong({ ...song, semitones: clampSemitones(semitones) }),
      setScrollSpeed: (step) => updateSong({ ...song, scrollSpeed: clampSpeed(step) }),
    }),
    [global, song, ready, updateGlobal, updateSong],
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
