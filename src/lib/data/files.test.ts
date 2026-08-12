import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { chordTokens, parseChordPro, plainLyrics } from '../chordpro'
import { estimateKey } from '../music/key'
import { fileRepository } from './files'

describe('fileRepository', () => {
  it('reads every song in content/', async () => {
    const songs = await fileRepository.listSongs()
    assert.ok(songs.length >= 4, `expected at least 4 songs, got ${songs.length}`)
  })

  it('takes metadata from the directives', async () => {
    const song = await fileRepository.getSong('le-luci-di-via-ostiense')
    assert.equal(song?.title, 'Le luci di via Ostiense')
    assert.equal(song?.artist, 'Placeholder')
    assert.deepEqual(song?.tags, ['lento'])
    assert.equal(song?.canzoniereSlug, 'repertorio')
  })

  it('returns null for an unknown slug', async () => {
    assert.equal(await fileRepository.getSong('non-esiste'), null)
  })

  it('sorts songs by title', async () => {
    const titles = (await fileRepository.listSongs()).map((song) => song.title)
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'it')))
  })
})

describe('canzonieri from the files', () => {
  it('derives one entry per distinct directive', async () => {
    const list = await fileRepository.listCanzonieri()
    assert.deepEqual(
      list.map((entry) => entry.slug),
      ['da-imparare', 'repertorio'],
    )
    assert.deepEqual(
      list.map((entry) => entry.name),
      ['Da imparare', 'Repertorio'],
    )
  })

  it('assigns every song to a canzoniere', async () => {
    const known = new Set((await fileRepository.listCanzonieri()).map((entry) => entry.slug))
    for (const song of await fileRepository.listSongs()) {
      assert.ok(song.canzoniereSlug, `${song.slug} has no canzoniere`)
      assert.ok(known.has(song.canzoniereSlug!), `${song.slug} points outside the list`)
    }
  })

  it('splits the fixtures the way the tags did', async () => {
    const songs = await fileRepository.listSongs()
    const bySlug = new Map(songs.map((song) => [song.slug, song.canzoniereSlug]))

    assert.equal(bySlug.get('ferma-il-tram'), 'repertorio')
    assert.equal(bySlug.get('le-luci-di-via-ostiense'), 'repertorio')
    assert.equal(bySlug.get('novembre-in-cortile'), 'da-imparare')
    assert.equal(bySlug.get('quasi-domenica'), 'da-imparare')
  })

  it('no longer carries the tags that became canzonieri', async () => {
    for (const song of await fileRepository.listSongs()) {
      assert.ok(!song.tags.includes('repertorio'), `${song.slug} still tagged repertorio`)
      assert.ok(!song.tags.includes('da imparare'), `${song.slug} still tagged da imparare`)
    }
  })
})

describe('the fixtures exercise the engine', () => {
  /**
   * Asked of the chords rather than of a column, which is where the answer lives now.
   *
   * Still worth asserting: the two spelling paths need a song each, or a bug in one of
   * them would never show up in a fixture.
   */
  it('covers both flat and sharp keys', async () => {
    const keys = (await fileRepository.listSongs()).map((song) =>
      estimateKey(chordTokens(parseChordPro(song.body))),
    )

    assert.ok(
      keys.some((key) => key?.flats === true),
      'no flat-key fixture',
    )
    assert.ok(
      keys.some((key) => key?.flats === false),
      'no sharp-key fixture',
    )
  })

  it('parses every fixture without losing lyrics', async () => {
    for (const song of await fileRepository.listSongs()) {
      const parsed = parseChordPro(song.body)
      assert.ok(parsed.sections.length > 0, `${song.slug} parsed to nothing`)
      assert.ok(plainLyrics(parsed).length > 40, `${song.slug} lost its lyrics`)
    }
  })
})
