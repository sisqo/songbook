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
