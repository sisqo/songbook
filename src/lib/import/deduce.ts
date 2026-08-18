/**
 * Works out title and artist from what was pasted.
 *
 * Directives win when they are there. Otherwise the leading plain lines are read
 * as a heading — which is how chord sites lay a song out — and are *removed from
 * the body*, because a title left in place would render as the first line of the
 * lyrics.
 *
 * The key used to be worked out here too, and is not any more: nothing stores it. The
 * reading layer estimates it from the chords when it needs to spell an accidental, and
 * that estimate is never anybody's to type in or correct.
 */

import { parseChordPro } from '../chordpro'

/**
 * Directives that only ever repeat a column this row already has of its own —
 * title, artist, tags, the songbook and section a re-import declares, the three
 * links, and a key nothing has stored in years. `export.ts` writes every one of
 * these fresh from the row rather than trusting a copy left in the body, so a copy
 * that survived import has no job left: it cannot be shown (the reading layer never
 * prints a directive it recognises), it cannot be exported (the row wins), and the
 * one place it does show up is the visual editor, as a directive chip with nothing
 * behind it to explain. Stripped here for the same reason `export.ts` strips it there.
 */
export const METADATA_DIRECTIVE =
  /^\s*\{\s*(?:title|t|artist|st|subtitle|key|tags?|canzoniere|songbook|division|sezione|link[123])\s*:[^}]*\}\s*$/i

export interface Deduced {
  title: string
  artist: string | null
  tags: string[]
  songbookName: string | null
  sectionName: string | null
  link1: string | null
  link2: string | null
  link3: string | null
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
  const rest = lines
    .slice(consumed)
    .filter((line) => !METADATA_DIRECTIVE.test(line))
    .join('\n')
    .replace(/^\n+/, '')

  return {
    title: parsed.title ?? heading[0] ?? '',
    artist: parsed.artist ?? heading[1] ?? null,
    tags: parsed.tags,
    songbookName: parsed.songbookName,
    sectionName: parsed.sectionName,
    link1: parsed.link1,
    link2: parsed.link2,
    link3: parsed.link3,
    body: rest,
  }
}
