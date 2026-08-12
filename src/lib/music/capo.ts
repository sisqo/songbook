/**
 * The capo: how far the chords you *read* are from the chords that *sound*.
 *
 * Two shifts live on this page at once and they are not the same shift, which is the
 * whole reason this is a module with tests rather than a subtraction inlined in a
 * component:
 *
 * - **Transposing** moves the sound. Up two semitones and the song comes out a tone
 *   higher, which is what you do when a key does not suit a voice.
 * - **A capo** moves the *hand* and leaves the sound alone. Clamp it on the second
 *   fret and every shape you finger is two semitones lower than what comes out, so
 *   the sheet has to show those lower shapes for the sound to stay put.
 *
 * Together: `read = written + semitones − capo`, while what sounds is `written +
 * semitones`. A capo of 2 with a transposition of +2 therefore shows the chords exactly
 * as written and sounds a tone above them — the case worth testing, because it is the
 * one where getting either sign wrong still looks plausible.
 *
 * Only the reading side has a function here. The sounding key had one too, until nothing
 * on the screen named a key any more; the sheet shows what the hand does, and what comes
 * out is the instrument's business.
 */

import { type Instrument, familyOf, isEasyShape } from './shapes'
import { type Key, type PitchClass, mod12, transposeKey } from './notes'
import { parseChord } from './chord'

/** Highest fret worth offering: above this a capo simplifies nothing. */
export const MAX_CAPO = 7

export function clampCapo(fret: number): number {
  return Math.max(0, Math.min(MAX_CAPO, Math.round(fret)))
}

/** How far to move the written chords to get the ones on the page. */
export function readShift(semitones: number, capo: number): number {
  return semitones - capo
}

/** The key whose letters are on the page, which is where the capo shows up. */
export function readKey(original: Key, semitones: number, capo: number): Key {
  return transposeKey(original, readShift(semitones, capo))
}

/** What a capo would do for the hands: how many of the song's chords come out easy. */
export interface CapoOption {
  fret: number
  easy: number
  total: number
}

/**
 * The distinct chords of a song, as root and family — the only two things a fingering
 * depends on. `[x2]` and `[assolo]` are dropped by the parser, and a suffix outside
 * the table keeps its chord in the count as a hard one, because that is what it is.
 */
function distinctChords(tokens: string[]): { root: PitchClass; suffix: string }[] {
  const seen = new Map<string, { root: PitchClass; suffix: string }>()

  for (const token of tokens) {
    const chord = parseChord(token)
    if (chord === null) continue

    const family = familyOf(chord.suffix)
    const suffix = family === null ? chord.suffix : family.family
    seen.set(`${chord.root}:${suffix}`, { root: chord.root, suffix })
  }

  return [...seen.values()]
}

/** How many of these chords are easy to hold once moved by `shift`. */
function easeAt(
  chords: { root: PitchClass; suffix: string }[],
  shift: number,
  instrument: Instrument,
): number {
  return chords.filter((chord) =>
    isEasyShape(mod12(chord.root + shift), chord.suffix, instrument),
  ).length
}

/** How the song sits under the hands as it is now: the baseline a suggestion must beat. */
export function easeOf(
  tokens: string[],
  semitones: number,
  capo: number,
  instrument: Instrument,
): CapoOption {
  const chords = distinctChords(tokens)

  return {
    fret: capo,
    easy: easeAt(chords, readShift(semitones, capo), instrument),
    total: chords.length,
  }
}

/**
 * A capo worth suggesting, or null when none is.
 *
 * Null in three cases, all of them "there is nothing useful to say": a song with no
 * chords, a song already all easy, and a song no capo improves. Ties go to the lowest
 * fret, since a capo further up the neck shortens the instrument for nothing.
 *
 * It compares against the capo currently on, not against no capo at all: once a reader
 * has chosen the second fret, being told that the second fret would help is noise.
 */
export function suggestCapo(
  tokens: string[],
  semitones: number,
  capo: number,
  instrument: Instrument,
): CapoOption | null {
  const chords = distinctChords(tokens)
  if (chords.length === 0) return null

  const current = easeAt(chords, readShift(semitones, capo), instrument)
  if (current === chords.length) return null

  let best: CapoOption | null = null

  for (let fret = 0; fret <= MAX_CAPO; fret += 1) {
    if (fret === capo) continue

    const easy = easeAt(chords, readShift(semitones, fret), instrument)
    if (best === null || easy > best.easy) best = { fret, easy, total: chords.length }
  }

  return best !== null && best.easy > current ? best : null
}
