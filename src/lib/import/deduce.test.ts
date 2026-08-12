import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from './convert'
import { deduce } from './deduce'

describe('deduce', () => {
  it('prefers the directives when they are there', () => {
    const result = deduce('{title: Certe notti}\n{artist: Ligabue}\n{key: G}\n\n[Am]testo')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    // Nothing was consumed, so the body is untouched — including the key directive,
    // which nothing reads and nothing therefore has to strip.
    assert.ok(result.body.includes('{key: G}'))
    assert.ok(result.body.includes('{title: Certe notti}'))
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
