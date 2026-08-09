/**
 * Pitch classes, enharmonic spelling, and key signatures.
 *
 * A pitch class is 0..11 with C = 0. Every spelling decision in the app comes
 * back to one rule: the target key decides whether accidentals are written as
 * sharps or flats, so transposing to Bb gives `Bb`, never `A#`.
 */

export type PitchClass = number

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NATURAL_PITCH_CLASS: Record<string, PitchClass> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

/** Note names in Italian, indexed the same way as the natural letters above. */
const ITALIAN_NOTE: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
}

export type Mode = 'major' | 'minor'

/**
 * For each pitch class, the key spelling with the fewest accidentals, and
 * whether that key writes its accidentals as flats.
 *
 * Two ties are resolved by convention rather than by counting: pitch class 6
 * major is written F# (6 sharps) instead of Gb (6 flats) because guitar music
 * overwhelmingly spells it that way, and pitch class 3 minor is written Ebm
 * instead of D#m for the same reason in the other direction.
 */
const MAJOR_KEYS: { name: string; flats: boolean }[] = [
  { name: 'C', flats: false },
  { name: 'Db', flats: true },
  { name: 'D', flats: false },
  { name: 'Eb', flats: true },
  { name: 'E', flats: false },
  { name: 'F', flats: true },
  { name: 'F#', flats: false },
  { name: 'G', flats: false },
  { name: 'Ab', flats: true },
  { name: 'A', flats: false },
  { name: 'Bb', flats: true },
  { name: 'B', flats: false },
]

const MINOR_KEYS: { name: string; flats: boolean }[] = [
  { name: 'Cm', flats: true },
  { name: 'C#m', flats: false },
  { name: 'Dm', flats: true },
  { name: 'Ebm', flats: true },
  { name: 'Em', flats: false },
  { name: 'Fm', flats: true },
  { name: 'F#m', flats: false },
  { name: 'Gm', flats: true },
  { name: 'G#m', flats: false },
  { name: 'Am', flats: false },
  { name: 'Bbm', flats: true },
  { name: 'Bm', flats: false },
]

/** Parses a note name such as `C`, `F#`, `Bbb` into a pitch class. */
export function noteToPitchClass(name: string): PitchClass | null {
  const match = /^([A-Ga-g])([#b]*)$/.exec(name.trim())
  if (!match) return null

  const letter = match[1].toUpperCase()
  let pc = NATURAL_PITCH_CLASS[letter]
  for (const accidental of match[2]) {
    pc += accidental === '#' ? 1 : -1
  }
  return mod12(pc)
}

export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12
}

/** Spells a pitch class, using flats or sharps as the target key requires. */
export function spellPitchClass(pc: PitchClass, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]
}

/** Rewrites an international note name in Italian: `Bb` becomes `Sib`. */
export function noteToItalian(name: string): string {
  const match = /^([A-G])([#b]*)$/.exec(name)
  if (!match) return name
  return ITALIAN_NOTE[match[1]] + match[2]
}

export interface Key {
  pc: PitchClass
  mode: Mode
  /** Canonical spelling of this key, e.g. `Bb` or `F#m`. */
  name: string
  /** Whether music in this key writes accidentals as flats. */
  flats: boolean
}

/**
 * Parses a key as written in a `{key:}` directive: `C`, `Am`, `Bb`, `F#m`.
 * Anything unrecognised yields null so callers can fall back to C major
 * rather than guessing.
 */
export function parseKey(raw: string | null | undefined): Key | null {
  if (!raw) return null

  const match = /^([A-Ga-g][#b]*)\s*(m|min|minor|-)?$/.exec(raw.trim())
  if (!match) return null

  const pc = noteToPitchClass(match[1])
  if (pc === null) return null

  const mode: Mode = match[2] ? 'minor' : 'major'
  return keyFor(pc, mode)
}

/** The canonical key for a pitch class and mode. */
export function keyFor(pc: PitchClass, mode: Mode): Key {
  const table = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS
  const entry = table[mod12(pc)]
  return { pc: mod12(pc), mode, name: entry.name, flats: entry.flats }
}

/** Moves a key by a number of semitones, keeping its mode. */
export function transposeKey(key: Key, semitones: number): Key {
  return keyFor(mod12(key.pc + semitones), key.mode)
}

export const C_MAJOR: Key = keyFor(0, 'major')
