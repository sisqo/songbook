/**
 * Local read cache for preferences.
 *
 * The database stays the single source of truth, but it cannot be the only
 * place preferences are read from, for two reasons the architecture forces:
 *
 * 1. Offline — the whole point of precaching the songs — there is no database
 *    to read. Without a local copy every song would open in its original key
 *    with no memory of the transposition you set last night.
 * 2. A network read cannot finish before the first paint, so the sheet would
 *    render in the wrong key and visibly jump. Reading this cache in a layout
 *    effect is synchronous, so it lands before anything is painted.
 *
 * This is a cache, not a second source of truth: the server's value wins on
 * conflict, and nothing here is ever authoritative.
 */

import {
  DEFAULT_GLOBAL_PREFS,
  DEFAULT_SONG_PREFS,
  type GlobalPrefs,
  type SongPrefs,
  clampSemitones,
  clampSpeed,
  clampZoom,
} from './types'

const GLOBAL_KEY = 'songs:prefs'
const SONG_KEY_PREFIX = 'songs:song:'

function read(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    // Private-mode browsers and disabled storage both throw; a missing cache is
    // not an error, it just means we fall back to defaults.
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do: the cache is optional by design.
  }
}

export function readGlobalPrefs(): GlobalPrefs {
  const cached = read(GLOBAL_KEY) as Partial<GlobalPrefs> | null
  if (!cached) return DEFAULT_GLOBAL_PREFS

  return {
    zoomStep:
      typeof cached.zoomStep === 'number' ? clampZoom(cached.zoomStep) : DEFAULT_GLOBAL_PREFS.zoomStep,
    notation: cached.notation === 'int' || cached.notation === 'it' ? cached.notation : 'it',
  }
}

export function writeGlobalPrefs(prefs: GlobalPrefs): void {
  write(GLOBAL_KEY, prefs)
}

export function readSongPrefs(slug: string): SongPrefs {
  const cached = read(SONG_KEY_PREFIX + slug) as Partial<SongPrefs> | null
  if (!cached) return DEFAULT_SONG_PREFS

  return {
    semitones:
      typeof cached.semitones === 'number'
        ? clampSemitones(cached.semitones)
        : DEFAULT_SONG_PREFS.semitones,
    scrollSpeed:
      typeof cached.scrollSpeed === 'number'
        ? clampSpeed(cached.scrollSpeed)
        : DEFAULT_SONG_PREFS.scrollSpeed,
  }
}

export function writeSongPrefs(slug: string, prefs: SongPrefs): void {
  write(SONG_KEY_PREFIX + slug, prefs)
}
