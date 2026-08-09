import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro, plainLyrics } from '../chordpro'
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
    assert.equal(song?.originalKey, 'Bb')
    assert.deepEqual(song?.tags, ['lento', 'repertorio'])
  })

  it('returns null for an unknown slug', async () => {
    assert.equal(await fileRepository.getSong('non-esiste'), null)
  })

  it('sorts songs by title', async () => {
    const titles = (await fileRepository.listSongs()).map((song) => song.title)
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'it')))
  })

  it('orders setlists by position and keeps song order', async () => {
    const setlists = await fileRepository.listSetlists()
    assert.deepEqual(
      setlists.map((setlist) => setlist.name),
      ['Sabato in cantina', 'Serata piano'],
    )
    assert.deepEqual(setlists[1].songs, ['novembre-in-cortile', 'le-luci-di-via-ostiense'])
  })

  it('references only songs that exist', async () => {
    const slugs = new Set((await fileRepository.listSongs()).map((song) => song.slug))
    for (const setlist of await fileRepository.listSetlists()) {
      for (const slug of setlist.songs) {
        assert.ok(slugs.has(slug), `${setlist.slug} references missing song ${slug}`)
      }
    }
  })
})

describe('the fixtures exercise the engine', () => {
  it('covers both flat and sharp keys', async () => {
    const keys = (await fileRepository.listSongs()).map((song) => song.originalKey)
    assert.ok(
      keys.some((key) => key?.includes('b')),
      'no flat-key fixture',
    )
    assert.ok(
      keys.some((key) => key?.includes('#')),
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
