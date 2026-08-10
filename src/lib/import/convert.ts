/**
 * Turns pasted text into ChordPro.
 *
 * Chords are almost always published as a line of chord names sitting above the
 * line of lyrics, aligned by column. That is what this converts. It is a
 * heuristic and it will be wrong on some sources, which is why the import screen
 * shows a preview and keeps the converted body editable — the escape hatch is
 * part of the design, not an apology for it.
 */

import { parseChord } from '../music/chord'

export type InputFormat = 'chordpro' | 'chords-above' | 'lyrics-only'

export interface Converted {
  format: InputFormat
  /** ChordPro body, ready to store. */
  body: string
}

interface Token {
  text: string
  /** Zero-based column where the token starts. */
  col: number
}

function tokens(line: string): Token[] {
  const found: Token[] = []
  const pattern = /\S+/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    found.push({ text: match[0], col: match.index })
  }
  return found
}

/**
 * True when every token on the line reads as a chord.
 *
 * `parseChord` already refuses ordinary words and annotations, so `Ritornello`
 * and `x2` are not mistaken for music. Requiring *all* tokens to be chords is
 * what keeps a lyric line that happens to start with the word "La" from being
 * read as a chord line.
 */
export function isChordLine(line: string): boolean {
  const found = tokens(line)
  if (found.length === 0) return false
  return found.every((token) => parseChord(token.text) !== null)
}

/** A bracketed or colon-terminated label, e.g. `[Verse 1]` or `Ritornello:`. */
function sectionLabel(line: string): string | null {
  const trimmed = line.trim()

  const bracketed = /^\[([^\]]+)\]$/.exec(trimmed)
  if (bracketed !== null && parseChord(bracketed[1]) === null) return bracketed[1].trim()

  const colon = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 '’]{0,24}):$/.exec(trimmed)
  if (colon !== null) return colon[1].trim()

  return null
}

/**
 * Places each chord above the syllable it sits over, by column.
 *
 * Inserted back to front so earlier insertions do not shift the columns still to
 * be used. The lyric line is padded first, so a chord hanging past the end of
 * the words — common on a final ritornello — still lands after them instead of
 * being dropped.
 */
function merge(chordLine: string, lyricLine: string): string {
  const chords = tokens(chordLine)
  if (chords.length === 0) return lyricLine

  const widest = Math.max(...chords.map((token) => token.col))
  let out = lyricLine.padEnd(widest, ' ')

  for (const token of [...chords].reverse()) {
    out = `${out.slice(0, token.col)}[${token.text}]${out.slice(token.col)}`
  }
  return out.trimEnd()
}

/** A chord line with no lyrics under it, e.g. an intro or a solo. */
function chordsOnly(line: string): string {
  return tokens(line)
    .map((token) => `[${token.text}]`)
    .join(' ')
}

function isDirective(line: string): boolean {
  return /^\s*\{.*\}\s*$/.test(line.trim())
}

/**
 * Detects whether the text is already ChordPro.
 *
 * The test is whether any bracketed token reads as a chord — not merely whether
 * brackets appear, because `[Verse 1]` and `[x2]` are brackets that mean
 * something else entirely.
 */
export function looksLikeChordPro(text: string): boolean {
  for (const match of text.matchAll(/\[([^\]\n]{1,12})\]/g)) {
    if (parseChord(match[1]) !== null) return true
  }
  return false
}

export function convert(text: string): Converted {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')

  if (looksLikeChordPro(normalised)) {
    return { format: 'chordpro', body: normalised.trim() }
  }

  const lines = normalised.split('\n')
  const out: string[] = []
  let sawChords = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')

    if (isDirective(line)) {
      out.push(line.trim())
      continue
    }

    const label = sectionLabel(line)
    if (label !== null) {
      out.push(`{comment: ${label}}`)
      continue
    }

    if (isChordLine(line)) {
      sawChords = true
      const next = lines[i + 1] ?? ''

      // A chord line pairs with the words underneath, unless there are none.
      if (next.trim() !== '' && !isChordLine(next) && sectionLabel(next) === null && !isDirective(next)) {
        out.push(merge(line, next.replace(/\s+$/, '')))
        i++
      } else {
        out.push(chordsOnly(line))
      }
      continue
    }

    out.push(line)
  }

  // Collapse runs of blank lines: they separate sections, and more than one
  // separator means nothing extra.
  const body = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { format: sawChords ? 'chords-above' : 'lyrics-only', body }
}
