import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import type { Song } from '../data/types'
import { choproFilename, toChoproFile } from './export'

const song: Song = {
  slug: 'certe-notti',
  title: 'Certe notti',
  artist: 'Ligabue',
  tags: ['lento'],
  canzoniereSlug: 'repertorio',
  body: '{title: Vecchio titolo}\n{key: G}\n\n[Am]Certe notti',
  // An export is a file: nothing in it says which version it came from.
  updatedAt: '2026-08-11T06:00:00.000Z',
}

describe('toChoproFile', () => {
  it('writes the directives from the columns, not from the body', () => {
    const file = toChoproFile(song, 'Repertorio')

    assert.ok(file.startsWith('{title: Certe notti}\n'))
    assert.ok(file.includes('{artist: Ligabue}'))
    assert.ok(file.includes('{tags: lento}'))
    assert.ok(file.includes('{canzoniere: Repertorio}'))
  })

  /*
   * The key is in the body of the fixture and in no column, which is the state every
   * imported song is in now. It has to leave: it is metadata the app does not keep, and
   * a directive nothing reads is not something to hand back in an export.
   */
  it('drops the stale directives that were in the body', () => {
    const file = toChoproFile(song, 'Repertorio')
    assert.ok(!file.includes('Vecchio titolo'), 'old title survived')
    assert.ok(!file.includes('{key: G}'), 'the key directive survived')
  })

  it('keeps the music', () => {
    assert.ok(toChoproFile(song, 'Repertorio').includes('[Am]Certe notti'))
  })

  it('omits directives with nothing to say', () => {
    const bare = toChoproFile({ ...song, artist: null, tags: [] }, null)
    assert.ok(!bare.includes('{artist:'))
    assert.ok(!bare.includes('{tags:'))
    assert.ok(!bare.includes('{canzoniere:'))
  })

  it('round trips: the parser reads back what the columns said', () => {
    const parsed = parseChordPro(toChoproFile(song, 'Repertorio'))

    assert.equal(parsed.title, 'Certe notti')
    assert.equal(parsed.artist, 'Ligabue')
    assert.deepEqual(parsed.tags, ['lento'])
    assert.equal(parsed.canzoniere, 'Repertorio')
    assert.equal(parsed.sections.length, 1)
  })
})

describe('choproFilename', () => {
  it('names the file after the slug, which is how the seed reads it back', () => {
    assert.equal(choproFilename('certe-notti'), 'certe-notti.chopro')
  })
})
