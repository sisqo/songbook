/**
 * ChordPro parser.
 *
 * The output is shaped by one hard requirement from the reading UI: chords sit
 * above the exact syllable they belong to, and a long line must be able to wrap
 * without the alignment drifting. So the parser groups the line into *words*,
 * and each word into chord/text parts. The renderer can then make every word an
 * unbreakable box and let the browser wrap between words, which is the failure
 * mode this layout usually has on a phone.
 */

export interface Part {
  /** Raw chord token from the source, still in international notation. */
  chord: string | null
  text: string
}

export interface Word {
  parts: Part[]
}

export type Line =
  | { kind: 'lyrics'; words: Word[]; hasChords: boolean }
  | { kind: 'comment'; text: string }

export type SectionKind = 'verse' | 'chorus' | 'bridge'

export interface Section {
  kind: SectionKind
  lines: Line[]
}

export interface ParsedSong {
  title: string | null
  artist: string | null
  tags: string[]
  /**
   * Name of the canzoniere this song *starts* in. Only ever an initial value:
   * the seed applies it on insert, or when the column is still empty, and
   * ignores it afterwards. From then on the database owns the assignment, or a
   * reseed would wipe every rename and move made in the app.
   */
  canzoniere: string | null
  sections: Section[]
}

const DIRECTIVE = /^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?)\s*)?\}$/

/** Directive aliases, mapped to the canonical name we act on. */
const DIRECTIVE_ALIAS: Record<string, string> = {
  t: 'title',
  title: 'title',
  st: 'artist',
  subtitle: 'artist',
  artist: 'artist',
  tags: 'tags',
  tag: 'tags',
  canzoniere: 'canzoniere',
  songbook: 'canzoniere',
  c: 'comment',
  comment: 'comment',
  soc: 'start_of_chorus',
  start_of_chorus: 'start_of_chorus',
  eoc: 'end_of_chorus',
  end_of_chorus: 'end_of_chorus',
  sob: 'start_of_bridge',
  start_of_bridge: 'start_of_bridge',
  eob: 'end_of_bridge',
  end_of_bridge: 'end_of_bridge',
}

export function parseChordPro(source: string): ParsedSong {
  const song: ParsedSong = {
    title: null,
    artist: null,
    tags: [],
    canzoniere: null,
    sections: [],
  }

  let section: Section | null = null
  let forcedKind: SectionKind | null = null

  const openSection = (kind: SectionKind): Section => {
    const created: Section = { kind, lines: [] }
    song.sections.push(created)
    return created
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    const directive = DIRECTIVE.exec(line.trim())
    if (directive) {
      const name = DIRECTIVE_ALIAS[directive[1].toLowerCase()]
      const value = directive[2] ?? ''

      switch (name) {
        case 'title':
          song.title = value || null
          break
        case 'artist':
          song.artist = value || null
          break
        case 'tags':
          song.tags = value
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag !== '')
          break
        case 'canzoniere':
          song.canzoniere = value || null
          break
        case 'comment':
          section ??= openSection(forcedKind ?? 'verse')
          section.lines.push({ kind: 'comment', text: value })
          break
        case 'start_of_chorus':
          forcedKind = 'chorus'
          section = openSection('chorus')
          break
        case 'start_of_bridge':
          forcedKind = 'bridge'
          section = openSection('bridge')
          break
        case 'end_of_chorus':
        case 'end_of_bridge':
          forcedKind = null
          section = null
          break
        default:
          // Unknown directives are ignored rather than shown as lyrics.
          break
      }
      continue
    }

    if (line.trim() === '') {
      // A blank line closes an implicit verse; explicit sections are closed by
      // their own end directive instead.
      if (forcedKind === null) section = null
      continue
    }

    section ??= openSection(forcedKind ?? 'verse')
    section.lines.push(parseLyricLine(line))
  }

  return song
}

/**
 * Splits one line into words and chord/text parts.
 *
 * A chord that is immediately followed by a space attaches to the *next* word
 * rather than hanging over an empty slot — which is what reads correctly for
 * `[Am] Certe notti`. A chord with no following word at all (an instrumental
 * line such as `[C] [F] [G]`) becomes a word of its own.
 */
export function parseLyricLine(line: string): Line {
  const words: Word[] = []
  let parts: Part[] = []
  let text = ''
  let chord: string | null = null
  let deferred: string | null = null
  let hasChords = false

  const flushPart = () => {
    if (chord !== null || text !== '') {
      parts.push({ chord, text })
      chord = null
      text = ''
    }
  }

  const flushWord = () => {
    flushPart()
    if (parts.length > 0) {
      words.push({ parts })
      parts = []
    }
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '[') {
      const close = line.indexOf(']', i)
      if (close === -1) {
        // An unclosed bracket is literal text, not a broken chord.
        text += char
        continue
      }

      const token = line.slice(i + 1, close)
      i = close

      if (deferred !== null) {
        // The previous chord never found a word to sit on; keep it visible.
        words.push({ parts: [{ chord: deferred, text: '' }] })
        deferred = null
      }

      flushPart()
      chord = token
      hasChords = true
      continue
    }

    if (/\s/.test(char)) {
      if (text === '' && chord !== null) {
        // Chord sits right before a space: hold it for the next word.
        deferred = chord
        chord = null
      }
      flushWord()
      continue
    }

    if (text === '' && chord === null && deferred !== null) {
      chord = deferred
      deferred = null
    }
    text += char
  }

  flushWord()

  if (deferred !== null) {
    words.push({ parts: [{ chord: deferred, text: '' }] })
  }

  return { kind: 'lyrics', words, hasChords }
}

/** Lyrics with all chords removed — used to build the search index. */
export function plainLyrics(song: ParsedSong): string {
  const lines: string[] = []

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind === 'comment') continue
      lines.push(line.words.map((word) => word.parts.map((part) => part.text).join('')).join(' '))
    }
  }
  return lines.join('\n')
}

/** Every distinct chord token in the song, in order of first appearance. */
export function chordTokens(song: ParsedSong): string[] {
  const seen = new Set<string>()

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind === 'comment') continue
      for (const word of line.words) {
        for (const part of word.parts) {
          if (part.chord !== null) seen.add(part.chord)
        }
      }
    }
  }
  return [...seen]
}
