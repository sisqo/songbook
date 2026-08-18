import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from './convert'
import { deduce } from './deduce'

describe('deduce', () => {
  it('prefers the directives when they are there', () => {
    const result = deduce('{title: Certe notti}\n{artist: Ligabue}\n{key: G}\n\n[Am]testo')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    // Read into their own fields, so the copies in the body are redundant —
    // `export.ts` rewrites them from the row anyway — and stripped here rather than
    // left as directive chips with nothing behind them in the visual editor.
    assert.equal(result.body, '[Am]testo')
  })

  it('strips a songbook or section a re-import declares, and stray tags', () => {
    const result = deduce('{title: Uno}\n{songbook: Cartoni animati}\n{division: Sigle}\n{tags: rock}\n[C]testo')

    assert.equal(result.songbookName, 'Cartoni animati')
    assert.equal(result.sectionName, 'Sigle')
    assert.deepEqual(result.tags, ['rock'])
    assert.equal(result.body, '[C]testo')
  })

  it('reads the three links and strips them from the body, gap included', () => {
    const result = deduce('{title: Uno}\n{link1: https://a}\n{link3: https://c}\n[C]testo')

    assert.equal(result.link1, 'https://a')
    assert.equal(result.link2, null)
    assert.equal(result.link3, 'https://c')
    assert.equal(result.body, '[C]testo')
  })

  it('reads a two-line heading and removes it from the body', () => {
    const result = deduce('Certe notti\nLigabue\n\n[Am]Certe notti la [F]macchina')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    assert.equal(result.body, '[Am]Certe notti la [F]macchina')
    assert.ok(!result.body.includes('Ligabue'), 'the artist stayed in the lyrics')
  })

  it('reads a one-line heading', () => {
    const result = deduce('Certe notti\n\n[Am]testo')
    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, null)
    assert.equal(result.body, '[Am]testo')
  })

  it('treats a heading running straight into more plain lines as lyrics', () => {
    // Three plain lines in a row are verses, not a title and an artist.
    const result = deduce('prima riga\nseconda riga\nterza riga')
    assert.equal(result.title, '')
    assert.equal(result.body, 'prima riga\nseconda riga\nterza riga')
  })

  it('stops the heading at the first line carrying chords', () => {
    const result = deduce('Certe notti\n[Am]subito il testo')
    assert.equal(result.title, 'Certe notti')
    assert.equal(result.body, '[Am]subito il testo')
  })

  it('works on the output of the converter', () => {
    const pasted = [
      'Certe notti',
      'Ligabue',
      '',
      'Am        F',
      'Certe notti la',
      'C         G      Am',
      'macchina sembra una donna',
    ].join('\n')
    const result = deduce(convert(pasted).body)

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    assert.ok(result.body.startsWith('[Am]'))
  })
})
