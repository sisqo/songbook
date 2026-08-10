/**
 * Guitar shapes for chords, in standard tuning.
 *
 * Two sources, in this order:
 *
 * 1. A short table of shapes played in open position, because the movable forms
 *    below would otherwise answer "C" with a barre at the third fret when what a
 *    guitarist plays is x32010.
 * 2. Movable forms anchored to the root on the sixth or fifth string. One entry
 *    per chord family covers all twelve roots, and the lower of the two candidates
 *    wins.
 *
 * Every entry — curated and derived — is checked by the tests against the pitch
 * classes it produces: no note outside the chord, and the tones that make the
 * chord what it is all present. That check is what the fret numbers here rest on;
 * they are not transcribed from a source, so the claim is "these are voicings of
 * the right chord", not "these are the fingerings a given book prints".
 */

import { type Chord, normalizeSuffix } from './chord'
import { type PitchClass, mod12, spellPitchClass } from './notes'

/** Open string pitch classes, low E to high e. */
export const STRINGS: PitchClass[] = [4, 9, 2, 7, 11, 4]

/** A fret per string, low to high. `null` is a muted string, `0` is open. */
export type Fret = number | null

export interface ChordShape {
  frets: Fret[]
  /** Which chord this is a voicing of, after any simplification. */
  family: string
  /**
   * True when the suffix asked for something the table does not carry and a
   * near relative was used — a 13th drawn as a dominant seventh, say.
   */
  simplified: boolean
}

interface Family {
  /** Intervals from the root, in semitones. */
  intervals: number[]
  /** Intervals a voicing must contain, or it is not this chord. */
  required: number[]
}

/**
 * The families the diagrams cover. `required` is what separates a real voicing
 * from a root-and-fifth that happens to fit: a major shape without its third is
 * not a major chord.
 */
export const FAMILIES: Record<string, Family> = {
  '': { intervals: [0, 4, 7], required: [0, 4] },
  m: { intervals: [0, 3, 7], required: [0, 3] },
  '7': { intervals: [0, 4, 7, 10], required: [0, 4, 10] },
  m7: { intervals: [0, 3, 7, 10], required: [0, 3, 10] },
  maj7: { intervals: [0, 4, 7, 11], required: [0, 4, 11] },
  '6': { intervals: [0, 4, 7, 9], required: [0, 4, 9] },
  m6: { intervals: [0, 3, 7, 9], required: [0, 3, 9] },
  sus4: { intervals: [0, 5, 7], required: [0, 5] },
  sus2: { intervals: [0, 2, 7], required: [0, 2] },
  '7sus4': { intervals: [0, 5, 7, 10], required: [0, 5, 10] },
  dim: { intervals: [0, 3, 6], required: [0, 3, 6] },
  dim7: { intervals: [0, 3, 6, 9], required: [0, 3, 6, 9] },
  m7b5: { intervals: [0, 3, 6, 10], required: [0, 3, 6, 10] },
  aug: { intervals: [0, 4, 8], required: [0, 4, 8] },
  '9': { intervals: [0, 2, 4, 7, 10], required: [0, 2, 4, 10] },
  m9: { intervals: [0, 2, 3, 7, 10], required: [0, 2, 3, 10] },
  maj9: { intervals: [0, 2, 4, 7, 11], required: [0, 2, 11] },
  add9: { intervals: [0, 2, 4, 7], required: [0, 2, 4] },
}

/**
 * Movable forms. Each is written at its open position — the E form is the shape
 * of E major, the A form the shape of A major — and moving it means adding the
 * same number to every fretted string, open strings included, which is what a
 * barre does.
 */
const FORMS: { root: PitchClass; shapes: Record<string, Fret[]> }[] = [
  {
    // Root on the sixth string.
    root: 4,
    shapes: {
      '': [0, 2, 2, 1, 0, 0],
      m: [0, 2, 2, 0, 0, 0],
      '7': [0, 2, 0, 1, 0, 0],
      m7: [0, 2, 0, 0, 0, 0],
      maj7: [0, 2, 1, 1, 0, 0],
      '6': [0, 2, 2, 1, 2, 0],
      m6: [0, 2, 2, 0, 2, 0],
      sus4: [0, 2, 2, 2, 0, 0],
      sus2: [0, 2, 4, 4, 0, 0],
      '7sus4': [0, 2, 0, 2, 0, 0],
      dim: [0, 1, 2, 0, null, null],
      dim7: [0, 1, 2, 0, 2, null],
      m7b5: [0, 1, 0, 0, null, null],
      aug: [0, 3, 2, 1, 1, 0],
      '9': [0, 2, 0, 1, 0, 2],
      m9: [0, 2, 0, 0, 0, 2],
      maj9: [0, 2, 1, 1, 0, 2],
      add9: [0, 2, 2, 1, 0, 2],
    },
  },
  {
    // Root on the fifth string.
    root: 9,
    shapes: {
      '': [null, 0, 2, 2, 2, 0],
      m: [null, 0, 2, 2, 1, 0],
      '7': [null, 0, 2, 0, 2, 0],
      m7: [null, 0, 2, 0, 1, 0],
      maj7: [null, 0, 2, 1, 2, 0],
      '6': [null, 0, 2, 2, 2, 2],
      m6: [null, 0, 2, 2, 1, 2],
      sus4: [null, 0, 2, 2, 3, 0],
      sus2: [null, 0, 2, 2, 0, 0],
      '7sus4': [null, 0, 2, 0, 3, 0],
      dim: [null, 0, 1, 2, 1, null],
      dim7: [null, 0, 1, 2, 1, 2],
      m7b5: [null, 0, 1, 0, 1, null],
      aug: [null, 0, 3, 2, 2, 1],
      '9': [null, 0, 2, 4, 2, 3],
      m9: [null, 0, 2, 4, 1, 3],
      add9: [null, 0, 2, 4, 2, 0],
    },
  },
]

/**
 * Shapes played at the nut, keyed by root pitch class and family. These are the
 * ones where a barre would be the wrong answer.
 */
const OPEN: Record<string, Fret[]> = {
  '0:': [null, 3, 2, 0, 1, 0],
  '0:7': [null, 3, 2, 3, 1, 0],
  '0:maj7': [null, 3, 2, 0, 0, 0],
  '2:': [null, null, 0, 2, 3, 2],
  '2:m': [null, null, 0, 2, 3, 1],
  '2:7': [null, null, 0, 2, 1, 2],
  '2:m7': [null, null, 0, 2, 1, 1],
  '2:maj7': [null, null, 0, 2, 2, 2],
  '2:sus4': [null, null, 0, 2, 3, 3],
  '2:sus2': [null, null, 0, 2, 3, 0],
  '5:maj7': [null, null, 3, 2, 1, 0],
  '7:': [3, 2, 0, 0, 0, 3],
  '7:7': [3, 2, 0, 0, 0, 1],
  '7:maj7': [3, 2, 0, 0, 0, 2],
  '11:7': [null, 2, 1, 2, 0, 2],
}

/**
 * Reduces any canonical suffix to a family the table carries.
 *
 * A simplification may only ever *omit* a note, never contradict one. Dropping
 * the thirteenth from a 13th chord leaves a dominant seventh, and every string
 * still belongs to what the chart asked for. Drawing a plain ninth for a `7b9`
 * would instead sound the natural ninth the chart flattens, and a plain seventh
 * for a `7b5` the fifth it lowers — so those give up and let the dialog show the
 * notes instead of a shape that is quietly wrong.
 *
 * Order matters the same way it does in `normalizeSuffix`: the minor tests run
 * after `maj` and `m7b5`, because those also begin with an `m`.
 */
export function familyOf(rawSuffix: string): { family: string; simplified: boolean } | null {
  const suffix = normalizeSuffix(rawSuffix)
  if (suffix in FAMILIES) return { family: suffix, simplified: false }

  const has = (text: string) => suffix.includes(text)
  const near = (family: string) => ({ family, simplified: true })

  if (suffix.startsWith('m7b5')) return near('m7b5')
  if (suffix.startsWith('dim')) return near(has('7') ? 'dim7' : 'dim')
  if (suffix.startsWith('aug')) return near('aug')

  // An altered fifth cannot be omitted: the shape would sound the natural one.
  if (has('b5') || has('#5') || has('+5')) return null

  if (suffix.startsWith('maj')) return near(has('9') && !has('add') ? 'maj9' : 'maj7')

  if (suffix.startsWith('m')) {
    // `madd9` has no seventh, so the minor triad is the honest subset.
    if (has('add')) return near('m')
    if (has('9')) return near('m9')
    if (has('7') || has('11') || has('13')) return near('m7')
    if (has('6')) return near('m6')
    return near('m')
  }

  if (has('sus2')) return near('sus2')
  if (has('7sus') || (has('sus') && has('7'))) return near('7sus4')
  if (has('sus')) return near('sus4')

  // A sixth and a ninth together is not a dominant: no seventh belongs in it.
  if (has('6') && has('9')) return near('add9')
  if (has('add9')) return near('add9')
  if (has('add')) return near('')

  // An altered ninth keeps the seventh underneath and simply loses the alteration.
  if (has('b9') || has('#9')) return near('7')
  if (has('9')) return near('9')
  if (has('7') || has('11') || has('13')) return near('7')
  if (has('6')) return near('6')

  return null
}

/** The notes a shape actually sounds, low to high, as pitch classes. */
export function shapeNotes(frets: Fret[]): PitchClass[] {
  const notes: PitchClass[] = []
  frets.forEach((fret, string) => {
    if (fret !== null) notes.push(mod12(STRINGS[string] + fret))
  })
  return notes
}

/** Every candidate shape for a root and family, cheapest position first. */
export function candidates(root: PitchClass, family: string): Fret[][] {
  const found: Fret[][] = []

  const open = OPEN[`${mod12(root)}:${family}`]
  if (open !== undefined) found.push(open)

  for (const form of FORMS) {
    const shape = form.shapes[family]
    if (shape === undefined) continue

    const offset = mod12(root - form.root)
    found.push(shape.map((fret) => (fret === null ? null : fret + offset)))
  }

  return found
}

function highestFret(frets: Fret[]): number {
  return Math.max(...frets.map((fret) => fret ?? 0))
}

/**
 * The shape to draw for a chord, or null when the suffix is outside the table.
 *
 * A curated open shape wins outright. Otherwise the movable form that sits
 * lowest on the neck wins, which is what keeps a Bb from being drawn at the
 * tenth fret when the sixth will do.
 */
export function shapeFor(chord: Chord): ChordShape | null {
  const resolved = familyOf(chord.suffix)
  if (resolved === null) return null

  const options = candidates(chord.root, resolved.family)
  if (options.length === 0) return null

  const openShape = OPEN[`${mod12(chord.root)}:${resolved.family}`]
  const best =
    openShape !== undefined
      ? openShape
      : options.reduce((a, b) => (highestFret(b) < highestFret(a) ? b : a))

  return { frets: best, family: resolved.family, simplified: resolved.simplified }
}

/**
 * The chord's notes as names, for the times a shape cannot be drawn — and as
 * something to read next to the one that can.
 */
export function chordNoteNames(chord: Chord): string[] {
  const resolved = familyOf(chord.suffix)
  const intervals = resolved === null ? [0] : FAMILIES[resolved.family].intervals
  // Follow the chord's own spelling: a Bb chord names its notes with flats.
  const flats = chord.rootName.includes('b')

  const names = intervals.map((interval) => spellPitchClass(mod12(chord.root + interval), flats))
  if (chord.bass !== null && !intervals.some((i) => mod12(chord.root + i) === chord.bass)) {
    names.push(spellPitchClass(chord.bass, flats))
  }
  return names
}
