/**
 * Every change the editor can make, as functions on the document.
 *
 * Kept out of the components so each one can be tested on its own, and so the
 * graphic mode and the raw mode cannot disagree: both end up as a source string
 * through these.
 */

import {
  type Block,
  type ChordAt,
  type SongDocument,
  sectionsOf,
  shiftChords,
} from './document'

function replace(document: SongDocument, index: number, block: Block): SongDocument {
  const blocks = [...document.blocks]
  blocks[index] = block
  return { ...document, blocks }
}

function lyricsAt(document: SongDocument, index: number) {
  const block = document.blocks[index]
  return block !== undefined && block.kind === 'lyrics' ? block : null
}

/** The text of a line changed; its chords follow the words they sat above. */
export function setLineText(document: SongDocument, index: number, text: string): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  if (block.kind === 'comment') return replace(document, index, { ...block, text })
  if (block.kind !== 'lyrics') return document

  /**
   * A line emptied of text still keeps its chords, which is what makes a bare chord
   * line — `[re] [la] [re]`, an intro — writable by deleting the words. They pile up
   * at nought and stay in the order they were.
   */
  return replace(document, index, {
    ...block,
    text,
    chords: shiftChords(block.chords, block.text, text),
  })
}

export function addChord(
  document: SongDocument,
  index: number,
  at: number,
  name = '',
): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null) return document

  const clamped = Math.max(0, Math.min(block.text.length, at))
  const chords = [...block.chords, { at: clamped, name }].sort((a, b) => a.at - b.at)

  return replace(document, index, { ...block, chords })
}

export function setChord(
  document: SongDocument,
  index: number,
  chord: number,
  name: string,
): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null || block.chords[chord] === undefined) return document

  // An emptied chord is a removed chord: that is how you take one off a syllable
  // without hunting for a separate button.
  if (name.trim() === '') return removeChord(document, index, chord)

  const chords = block.chords.map((entry, at) =>
    at === chord ? { ...entry, name: name.trim() } : entry,
  )
  return replace(document, index, { ...block, chords })
}

export function removeChord(document: SongDocument, index: number, chord: number): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null) return document

  return replace(document, index, {
    ...block,
    chords: block.chords.filter((_, at) => at !== chord),
  })
}

/** Enter in the middle of a line: the chords go with their side of the cut. */
export function splitLine(document: SongDocument, index: number, at: number): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  const blocks = [...document.blocks]

  if (block.kind === 'lyrics') {
    const kept: ChordAt[] = []
    const moved: ChordAt[] = []

    for (const chord of block.chords) {
      // A chord exactly at the cut belongs to the syllable that follows it.
      if (chord.at < at) kept.push(chord)
      else moved.push({ ...chord, at: chord.at - at })
    }

    blocks.splice(
      index,
      1,
      { kind: 'lyrics', text: block.text.slice(0, at), chords: kept },
      { kind: 'lyrics', text: block.text.slice(at), chords: moved },
    )
  } else if (block.kind === 'comment') {
    blocks.splice(
      index,
      1,
      { ...block, text: block.text.slice(0, at) },
      { kind: 'lyrics', text: block.text.slice(at), chords: [] },
    )
  } else {
    blocks.splice(index + 1, 0, { kind: 'lyrics', text: '', chords: [] })
  }

  return { ...document, blocks }
}

/**
 * Backspace at the start of a line: it joins the one above.
 *
 * Only between two lyric lines. Merging a verse into a comment, or into `{soc}`,
 * would mean silently deciding which of the two the result is.
 */
export function joinLines(document: SongDocument, index: number): SongDocument {
  const previous = lyricsAt(document, index - 1)
  const current = lyricsAt(document, index)
  if (previous === null || current === null) return document

  const blocks = [...document.blocks]
  blocks.splice(index - 1, 2, {
    kind: 'lyrics',
    text: previous.text + current.text,
    chords: [
      ...previous.chords,
      ...current.chords.map((chord) => ({ ...chord, at: chord.at + previous.text.length })),
    ],
  })

  return { ...document, blocks }
}

export function insertLineAfter(document: SongDocument, index: number, block?: Block): SongDocument {
  const blocks = [...document.blocks]
  blocks.splice(index + 1, 0, block ?? { kind: 'lyrics', text: '', chords: [] })
  return { ...document, blocks }
}

export function removeLine(document: SongDocument, index: number): SongDocument {
  if (document.blocks.length <= 1) {
    return { ...document, blocks: [{ kind: 'lyrics', text: '', chords: [] }] }
  }

  return { ...document, blocks: document.blocks.filter((_, at) => at !== index) }
}

/**
 * A line of lyrics becomes a comment, or a comment becomes lyrics again.
 *
 * Turning a comment back into lyrics reads its text for chords, so pasting
 * `[la]assolo` into a comment and switching back does what it looks like.
 */
export function toggleComment(document: SongDocument, index: number): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  if (block.kind === 'comment') {
    return replace(document, index, { kind: 'lyrics', text: block.text, chords: [] })
  }

  if (block.kind !== 'lyrics') return document

  // The chords are dropped, and the text they were above is kept: a comment has no
  // syllables to sit on. Written out so it is a decision, not an accident.
  return replace(document, index, { kind: 'comment', directive: 'c', text: block.text })
}

/** The run of lines around `index` that a section directive would wrap. */
function runAround(blocks: Block[], index: number): { from: number; to: number } {
  const stops = (block: Block | undefined) =>
    block === undefined || block.kind === 'blank' || block.kind === 'boundary'

  let from = index
  while (!stops(blocks[from - 1])) from -= 1

  let to = index
  while (!stops(blocks[to + 1])) to += 1

  return { from, to }
}

/**
 * Marks the block of lines around the cursor as a chorus or a bridge, or takes the
 * marking off if it is already there.
 *
 * The same button both ways: with `{soc}` already around these lines, pressing
 * *Ritornello* again removes it rather than nesting a second one — which the reader
 * would read as a chorus that never ends.
 */
export function toggleSection(
  document: SongDocument,
  index: number,
  section: 'chorus' | 'bridge',
): SongDocument {
  const { blocks } = document
  const current = sectionsOf(blocks)[index]

  if (current === section) {
    // Drop the boundaries that put these lines here.
    const start = findBoundary(blocks, index, -1)
    const end = findBoundary(blocks, index, 1)
    const kept = blocks.filter((_, at) => at !== start && at !== end)

    return { ...document, blocks: kept }
  }

  if (current !== 'verse') {
    // Inside the other kind of section: change what the boundaries say rather than
    // adding a second pair inside the first.
    const start = findBoundary(blocks, index, -1)
    const end = findBoundary(blocks, index, 1)

    const swapped = blocks.map((block, at) => {
      if (at !== start && at !== end) return block
      const edge = at === start ? ('start' as const) : ('end' as const)
      return {
        kind: 'boundary' as const,
        directive: DIRECTIVE_FOR[section][edge],
        edge,
        section,
      }
    })

    return { ...document, blocks: swapped }
  }

  const { from, to } = runAround(blocks, index)
  const wrapped = [
    ...blocks.slice(0, from),
    { kind: 'boundary' as const, directive: DIRECTIVE_FOR[section].start, edge: 'start' as const, section },
    ...blocks.slice(from, to + 1),
    { kind: 'boundary' as const, directive: DIRECTIVE_FOR[section].end, edge: 'end' as const, section },
    ...blocks.slice(to + 1),
  ]

  return { ...document, blocks: wrapped }
}

const DIRECTIVE_FOR = {
  chorus: { start: 'soc', end: 'eoc' },
  bridge: { start: 'sob', end: 'eob' },
} as const

/** The boundary directive that opens or closes the section `index` is in. */
function findBoundary(blocks: Block[], index: number, direction: -1 | 1): number {
  const wanted = direction === -1 ? 'start' : 'end'

  for (let at = index; at >= 0 && at < blocks.length; at += direction) {
    const block = blocks[at]
    if (block.kind === 'boundary' && block.edge === wanted) return at
  }

  return -1
}
