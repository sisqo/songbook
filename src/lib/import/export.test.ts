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
  songbookSlug: 'repertorio',
  sectionId: 3,
  body: '{title: Vecchio titolo}\n{key: G}\n\n[Am]Certe notti',
  // An export is a file: nothing in it says which version it came from.
  updatedAt: '2026-08-11T06:00:00.000Z',
}

describe('toChoproFile', () => {
  it('writes the directives from the columns, not from the body', () => {
    const file = toChoproFile(song, 'Repertorio', 'Prima parte')

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
    const file = toChoproFile(song, 'Repertorio', 'Prima parte')
    assert.ok(!file.includes('Vecchio titolo'), 'old title survived')
    assert.ok(!file.includes('{key: G}'), 'the key directive survived')
  })

  it('keeps the music', () => {
    assert.ok(toChoproFile(song, 'Repertorio', 'Prima parte').includes('[Am]Certe notti'))
  })

  it('omits directives with nothing to say', () => {
    const bare = toChoproFile({ ...song, artist: null, tags: [] }, null, null)
    assert.ok(!bare.includes('{artist:'))
    assert.ok(!bare.includes('{tags:'))
    assert.ok(!bare.includes('{canzoniere:'))
    assert.ok(!bare.includes('{sezione:'))
  })

  it('round trips: the parser reads back what the columns said', () => {
    const parsed = parseChordPro(toChoproFile(song, 'Repertorio', 'Prima parte'))

    assert.equal(parsed.title, 'Certe notti')
    assert.equal(parsed.artist, 'Ligabue')
    assert.deepEqual(parsed.tags, ['lento'])
    assert.equal(parsed.songbookName, 'Repertorio')
    assert.equal(parsed.sectionName, 'Prima parte')
    assert.equal(parsed.sections.length, 1)
  })

  /**
   * The one directive an exported file must *not* carry back: a stale `{sezione}` in the
   * body would be read as filing, and the head is written from the columns.
   */
  it('strips a sezione that was in the body', () => {
    const file = toChoproFile(
      { ...song, body: '{sezione: Vecchia}\n\n[Am]Certe notti' },
      'Repertorio',
      'Prima parte',
    )

    assert.equal(file.match(/\{sezione:/g)?.length, 1)
    assert.ok(!file.includes('Vecchia'))
  })
})

describe('choproFilename', () => {
  it('names the file after the slug, which is how the seed reads it back', () => {
    assert.equal(choproFilename('certe-notti'), 'certe-notti.chopro')
  })
})
