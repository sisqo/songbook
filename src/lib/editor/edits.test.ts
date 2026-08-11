import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import { fromSource, toSource } from './document'
import {
  addChord,
  joinLines,
  removeChord,
  removeLine,
  setChord,
  setLineText,
  splitLine,
  toggleComment,
  toggleSection,
} from './edits'

/** Runs an edit on a source and gives the source back, which is what the UI does. */
const edit = (source: string, change: (doc: ReturnType<typeof fromSource>) => ReturnType<typeof fromSource>) =>
  toSource(change(fromSource(source)))

describe('editing the words', () => {
  it('carries the chords along', () => {
    const after = edit("[la]C'è un gran [mi]castello", (doc) =>
      setLineText(doc, 0, "Oh, c'è un gran castello"),
    )

    // "C'è un gran castello" → "Oh, c'è un gran castello": the second chord moved.
    assert.equal(after, "[la]Oh, c'è un gran [mi]castello")
  })

  it('keeps the chords of a line whose words are all deleted', () => {
    // How an intro gets written: type the chords, then clear the words.
    assert.equal(edit('[re]uno [la]due', (doc) => setLineText(doc, 0, '')), '[re][la]')
  })

  it('edits the text of a comment', () => {
    assert.equal(edit('{c: assolo}', (doc) => setLineText(doc, 0, 'assolo di chitarra')), '{c: assolo di chitarra}')
  })
})

describe('the chords themselves', () => {
  it('adds one where the cursor is', () => {
    assert.equal(edit('castello', (doc) => addChord(doc, 0, 4, 'mi')), 'cast[mi]ello')
  })

  it('keeps them in the order they appear', () => {
    const after = edit('castello', (doc) => addChord(addChord(doc, 0, 4, 'mi'), 0, 0, 'la'))
    assert.equal(after, '[la]cast[mi]ello')
  })

  it('renames one', () => {
    assert.equal(edit('[la]x', (doc) => setChord(doc, 0, 0, 'la7')), '[la7]x')
  })

  it('treats emptying one as removing it', () => {
    assert.equal(edit('[la]x[mi]y', (doc) => setChord(doc, 0, 0, '  ')), 'x[mi]y')
  })

  it('removes one by hand', () => {
    assert.equal(edit('[la]x[mi]y', (doc) => removeChord(doc, 0, 1)), '[la]xy')
  })
})

describe('splitting and joining lines', () => {
  it('gives each half the chords above it', () => {
    assert.equal(
      edit('[la]uno [mi]due', (doc) => splitLine(doc, 0, 4)),
      '[la]uno \n[mi]due',
    )
  })

  it('joins a line onto the one above, shifting what follows', () => {
    assert.equal(edit('[la]uno \n[mi]due', (doc) => joinLines(doc, 1)), '[la]uno [mi]due')
  })

  it('refuses to join a line onto a comment, which would swallow it', () => {
    const source = '{c: assolo}\n[la]uno'
    assert.equal(edit(source, (doc) => joinLines(doc, 1)), source)
  })

  it('never leaves the song with no lines at all', () => {
    assert.equal(edit('[la]sola', (doc) => removeLine(doc, 0)), '')
  })
})

describe('comments', () => {
  it('turns a line into one and back', () => {
    const commented = edit('assolo', (doc) => toggleComment(doc, 0))
    assert.equal(commented, '{c: assolo}')
    assert.equal(edit(commented, (doc) => toggleComment(doc, 0)), 'assolo')
  })

  it('keeps the words when the chords cannot come along', () => {
    assert.equal(edit('[la]assolo', (doc) => toggleComment(doc, 0)), '{c: assolo}')
  })
})

describe('choruses and bridges', () => {
  it('wraps the lines around the cursor, up to the blank lines', () => {
    const source = ['[la]strofa', '', '[la]coro uno', '[mi]coro due', '', '[la]altro'].join('\n')
    const after = edit(source, (doc) => toggleSection(doc, 2, 'chorus'))

    assert.equal(
      after,
      ['[la]strofa', '', '{soc}', '[la]coro uno', '[mi]coro due', '{eoc}', '', '[la]altro'].join('\n'),
    )
    assert.deepEqual(
      parseChordPro(after).sections.map((section) => section.kind),
      ['verse', 'chorus', 'verse'],
    )
  })

  it('takes the marking off when pressed again', () => {
    const source = ['{soc}', '[la]coro', '{eoc}'].join('\n')
    assert.equal(edit(source, (doc) => toggleSection(doc, 1, 'chorus')), '[la]coro')
  })

  it('changes a chorus into a bridge instead of nesting one inside it', () => {
    const source = ['{soc}', '[la]coro', '{eoc}'].join('\n')
    const after = edit(source, (doc) => toggleSection(doc, 1, 'bridge'))

    assert.equal(after, ['{sob}', '[la]coro', '{eob}'].join('\n'))
    assert.deepEqual(
      parseChordPro(after).sections.map((section) => section.kind),
      ['bridge'],
    )
  })

  it('leaves a chorus the reader can close', () => {
    // Marking, unmarking and marking again must not pile up directives.
    const source = ['[la]uno', '[mi]due'].join('\n')
    let document = fromSource(source)
    for (let round = 0; round < 3; round++) {
      document = toggleSection(document, round % 2 === 0 ? 0 : 1, 'chorus')
    }

    const boundaries = document.blocks.filter((block) => block.kind === 'boundary')
    assert.equal(boundaries.length, 2)
  })
})
