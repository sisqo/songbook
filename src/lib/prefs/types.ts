import type { Notation } from '../music/chord'
import type { Instrument } from '../music/shapes'

/** Preferences that belong to the reader, not to any one song. */
export interface GlobalPrefs {
  /** Index into ZOOM_STEPS. */
  zoomStep: number
  notation: Notation
  /** Which instrument the chord shapes are drawn for. */
  instrument: Instrument
}

/** Preferences that belong to a song: the key you sing it in, the speed you read it at. */
export interface SongPrefs {
  semitones: number
  /** Index into SCROLL_SPEEDS. */
  scrollSpeed: number
}

/** Font sizes for the sheet, in pixels. The text reflows; it is not a viewport zoom. */
export const ZOOM_STEPS = [14, 17, 20, 23, 26, 30] as const

/** Auto-scroll speeds in pixels per second. */
export const SCROLL_SPEEDS = [8, 13, 20, 28, 38, 50, 66, 86] as const

export const DEFAULT_GLOBAL_PREFS: GlobalPrefs = {
  zoomStep: 2,
  notation: 'it',
  instrument: 'chitarra',
}

/**
 * Reads an instrument from a value that came out of the database or the cache.
 *
 * Anything unrecognised means the guitar rather than nothing: an unknown string is a
 * value from a newer version of the app or a corrupted cache, and neither is a reason
 * to show a reader no chord shapes at all.
 */
export function readInstrument(value: unknown): Instrument {
  return value === 'ukulele' ? 'ukulele' : 'chitarra'
}

export const DEFAULT_SONG_PREFS: SongPrefs = { semitones: 0, scrollSpeed: 3 }

export function clampZoom(step: number): number {
  return Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(step)))
}

export function clampSpeed(step: number): number {
  return Math.max(0, Math.min(SCROLL_SPEEDS.length - 1, Math.round(step)))
}

/**
 * Transposition wraps at the octave: twelve semitones up is the same music, so
 * there is no reason to let the number run away.
 */
export function clampSemitones(semitones: number): number {
  const wrapped = Math.round(semitones) % 12
  if (wrapped > 6) return wrapped - 12
  if (wrapped < -5) return wrapped + 12
  return wrapped
}
