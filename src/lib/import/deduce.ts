/**
 * Works out title, artist and key from what was pasted.
 *
 * Directives win when they are there. Otherwise the leading plain lines are read
 * as a heading — which is how chord sites lay a song out — and are *removed from
 * the body*, because a title left in place would render as the first line of the
 * lyrics.
 */

import { chordTokens, parseChordPro } from '../chordpro'
import { formatKey } from '../music/chord'
import { estimateKey } from './key'

export interface Deduced {
  title: string
  artist: string | null
  /** International spelling, e.g. `Bb`. Null when there was nothing to go on. */
  key: string | null
  /** True when the key was guessed rather than declared. */
  keyIsGuess: boolean
  tags: string[]
  canzoniere: string | null
  /** The body with any consumed heading lines removed. */
  body: string
}

function isDirective(line: string): boolean {
  return /^\s*\{.*\}\s*$/.test(line)
}

function hasChords(line: string): boolean {
  return /\[[^\]\n]+\]/.test(line)
}

/**
 * How many of the first lines are a heading rather than the song.
 *
 * Only lines before the first blank line and before any line carrying chords,
 * and at most two — one is a title, two is a title and an artist. More than that
 * is not a heading, it is lyrics.
 */
function headingLines(lines: string[]): number {
  let count = 0

  for (const line of lines) {
    if (count >= 2) break
    if (line.trim() === '' || hasChords(line) || isDirective(line)) break
    count++
  }

  // A heading is followed by a break or by the music; two plain lines running
  // straight into more plain lines are verses.
  const next = lines[count]
  if (next !== undefined && next.trim() !== '' && !hasChords(next) && !isDirective(next)) {
    return 0
  }
  return count
}

export function deduce(body: string): Deduced {
  const parsed = parseChordPro(body)
  const lines = body.split('\n')

  const consumed = parsed.title === null ? headingLines(lines) : 0
  const heading = lines.slice(0, consumed).map((line) => line.trim())
  const rest = lines.slice(consumed).join('\n').replace(/^\n+/, '')

  const declaredKey = parsed.key
  const guessed = declaredKey === null ? estimateKey(chordTokens(parsed)) : null

  return {
    title: parsed.title ?? heading[0] ?? '',
    artist: parsed.artist ?? heading[1] ?? null,
    key: declaredKey ?? (guessed === null ? null : formatKey(guessed, 'int')),
    keyIsGuess: declaredKey === null && guessed !== null,
    tags: parsed.tags,
    canzoniere: parsed.canzoniere,
    body: consumed > 0 ? rest : body,
  }
}
