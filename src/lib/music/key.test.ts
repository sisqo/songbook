import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readKey } from './capo'
import { renderChord } from './chord'
import { estimateKey } from './key'
import { C_MAJOR } from './notes'

describe('estimateKey', () => {
  it('reads the fixtures the way their directives declare them', () => {
    // The same chord sets the four content files use.
    assert.equal(estimateKey(['Bb', 'Eb', 'F', 'Gm7', 'Bb/D', 'Fsus4', 'Bb'])?.name, 'Bb')
    assert.equal(estimateKey(['D', 'A', 'G', 'Dmaj7', 'Bm', 'F#dim', 'A', 'D'])?.name, 'D')
    assert.equal(estimateKey(['Am', 'F', 'C', 'G', 'Dm', 'E7', 'Am'])?.name, 'Am')
    assert.equal(estimateKey(['F#m', 'C#m', 'D', 'E', 'Bm7b5', 'A6/9', 'F#m'])?.name, 'F#m')
  })

  it('distinguishes a major key from its relative minor by where it lands', () => {
    assert.equal(estimateKey(['C', 'Am', 'F', 'G', 'C'])?.name, 'C')
    assert.equal(estimateKey(['Am', 'F', 'C', 'G', 'Am'])?.name, 'Am')
  })

  it('returns null when there is nothing to go on', () => {
    assert.equal(estimateKey([]), null)
    assert.equal(estimateKey(['Ritornello', 'x2']), null)
  })

  it('survives a single chord', () => {
    assert.equal(estimateKey(['C'])?.name, 'C')
    assert.equal(estimateKey(['Am'])?.name, 'Am')
  })
})

/**
 * What the estimate is actually for.
 *
 * Not a readout — nothing shows a key — but the choice between `F#` and `Gb` when a
 * chord moves. Both halves are asserted here: what the derived key spells, and what the
 * old fallback to C major would have spelled instead, because a test that only checks
 * the first would pass just as well with no estimate at all.
 */
describe('the estimate decides the accidentals', () => {
  const written = (tokens: string[]) => estimateKey(tokens) ?? C_MAJOR

  it('spells from the key the song is in, not from C', () => {
    const key = written(['Bb', 'Eb', 'F', 'Gm7', 'Bb'])
    assert.equal(key.name, 'Bb')

    // Bb up a semitone lands in B, which writes sharps.
    assert.equal(readKey(key, 1, 0).name, 'B')
    assert.equal(renderChord('C', 1, 'int', readKey(key, 1, 0)), 'C#')

    // Assuming C major — which is what a song with no stored key used to get — lands in
    // Db instead, and spells the same note the other way round.
    assert.equal(readKey(C_MAJOR, 1, 0).name, 'Db')
    assert.equal(renderChord('C', 1, 'int', readKey(C_MAJOR, 1, 0)), 'Db')
  })

  /*
   * The case the capo made ordinary: a shift with no transposition at all. Before the
   * capo there was no way to move the page without also moving the sound, so a wrong
   * written key could only ever show up in a song someone had transposed.
   */
  it('is on the reading path as soon as a capo is on', () => {
    const key = written(['Bb', 'Eb', 'F', 'Bb'])
    assert.equal(readKey(key, 0, 1).name, 'A')
    assert.equal(readKey(C_MAJOR, 0, 1).name, 'B')
  })
})
