import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Song } from '@/lib/data'

import { seriesOf } from './series'

function song(slug: string, songbookSlug: string): Song {
  return { slug, title: slug, artist: null, tags: [], songbookSlug, sectionId: 1, body: '', updatedAt: null }
}

describe('seriesOf', () => {
  it('finds the previous and next song in the same songbook, in list order', () => {
    const songs = [song('a', 'book'), song('b', 'book'), song('c', 'book')]

    assert.deepEqual(seriesOf(songs[1], songs), { position: 2, total: 3, previous: 'a', next: 'c' })
  })

  it('has no previous at the start and no next at the end', () => {
    const songs = [song('a', 'book'), song('b', 'book')]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
    assert.deepEqual(seriesOf(songs[1], songs), { position: 2, total: 2, previous: 'a', next: null })
  })

  it('crosses section boundaries: the songbook is one sequence, not one per section', () => {
    const songs = [
      { ...song('a', 'book'), sectionId: 1 },
      { ...song('b', 'book'), sectionId: 2 },
    ]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
  })

  it('returns null for a songbook holding only this one song', () => {
    const songs = [song('a', 'book'), song('x', 'other-book')]

    assert.equal(seriesOf(songs[1], songs), null)
  })

  it('ignores songs from other songbooks entirely', () => {
    const songs = [song('a', 'book'), song('x', 'other-book'), song('b', 'book'), song('y', 'other-book')]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
  })
})
