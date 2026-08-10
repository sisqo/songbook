/**
 * Estimates the key of a song from its chords.
 *
 * A guess, and the import screen labels it as one, because the key decides the
 * "original" readout and which accidentals appear when transposing — a wrong
 * guess is visible but harmless, while a wrong guess presented as fact is not.
 *
 * The method: score all 24 keys by how much of the song is diatonic to each,
 * then break ties with the chords in the positions that usually carry the tonic —
 * the last one above all.
 */

import { parseChord } from '../music/chord'
import { type Key, type Mode, keyFor, mod12 } from '../music/notes'

/** Scale degrees as {semitones from tonic, expected quality}. */
const MAJOR_DEGREES: { offset: number; minor: boolean }[] = [
  { offset: 0, minor: false },
  { offset: 2, minor: true },
  { offset: 4, minor: true },
  { offset: 5, minor: false },
  { offset: 7, minor: false },
  { offset: 9, minor: true },
  { offset: 11, minor: true },
]

/**
 * Natural minor, plus the major fifth. The raised fifth of harmonic minor is
 * everywhere in Italian song — Am with an E7 — so leaving it out would make every
 * minor-key guess worse.
 */
const MINOR_DEGREES: { offset: number; minor: boolean }[] = [
  { offset: 0, minor: true },
  { offset: 2, minor: true },
  { offset: 3, minor: false },
  { offset: 5, minor: true },
  { offset: 7, minor: false },
  { offset: 7, minor: true },
  { offset: 8, minor: false },
  { offset: 10, minor: false },
]

interface Observed {
  root: number
  minor: boolean
}

function observe(tokens: string[]): Observed[] {
  const seen: Observed[] = []

  for (const token of tokens) {
    const chord = parseChord(token)
    if (chord === null) continue
    seen.push({ root: chord.root, minor: /^m(?!aj)/.test(chord.suffix) })
  }
  return seen
}

function score(chords: Observed[], tonic: number, mode: Mode): number {
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES
  let total = 0

  for (const chord of chords) {
    const offset = mod12(chord.root - tonic)
    const matches = degrees.filter((degree) => degree.offset === offset)

    if (matches.length === 0) continue
    // Right root and right quality is the strong signal; right root alone still
    // counts, since sevenths and suspensions blur the quality.
    total += matches.some((degree) => degree.minor === chord.minor) ? 1 : 0.5
  }

  if (chords.length > 0) {
    const last = chords[chords.length - 1]
    if (last.root === tonic && last.minor === (mode === 'minor')) total += 1.5
    else if (last.root === tonic) total += 0.75

    if (chords[0].root === tonic && chords[0].minor === (mode === 'minor')) total += 0.75
  }

  return total
}

/**
 * The most likely key, or null when there are no chords to go on — in which case
 * the form leaves the field empty rather than inventing one.
 */
export function estimateKey(chordTokens: string[]): Key | null {
  const chords = observe(chordTokens)
  if (chords.length === 0) return null

  let best: { key: Key; score: number } | null = null

  for (const mode of ['major', 'minor'] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const value = score(chords, tonic, mode)
      if (best === null || value > best.score) {
        best = { key: keyFor(tonic, mode), score: value }
      }
    }
  }

  return best?.key ?? null
}
