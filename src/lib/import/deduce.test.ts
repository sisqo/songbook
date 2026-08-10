import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from './convert'
import { deduce } from './deduce'

describe('deduce', () => {
  it('prefers the directives when they are there', () => {
    const result = deduce('{title: Certe notti}\n{artist: Ligabue}\n{key: G}\n\n[Am]testo')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    assert.equal(result.key, 'G')
    assert.equal(result.keyIsGuess, false)
    // Nothing was consumed, so the body is untouched.
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

  it('guesses the key and says that it guessed', () => {
    const result = deduce('[Am]a [F]b [C]c [G]d [Am]e')
    assert.equal(result.key, 'Am')
    assert.equal(result.keyIsGuess, true)
  })

  it('leaves the key empty when there are no chords', () => {
    const result = deduce('solo parole\n\nnessun accordo')
    assert.equal(result.key, null)
    assert.equal(result.keyIsGuess, false)
  })

  it('works on the output of the converter', () => {
    // Ends on the tonic, as songs do. A two-chord fragment closing on F would be
    // read as F major, and reasonably so — the estimator leans on the last chord.
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
    assert.equal(result.key, 'Am')
    assert.equal(result.keyIsGuess, true)
    assert.ok(result.body.startsWith('[Am]'))
  })
})
