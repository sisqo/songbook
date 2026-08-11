import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Song } from '../data/types'
import type { SongIndexEntry } from '../search-index'
import { type SongIndexRow, isNewer, liveHaystack, mergeIndex, pick } from './overlay'

const BUILT = '2026-08-11T06:00:00.000Z'
const LATER = '2026-08-11T07:00:00.000Z'

function song(updatedAt: string | null, body = 'originale'): Song {
  return {
    slug: 'certe-notti',
    title: 'Certe notti',
    artist: 'Ligabue',
    originalKey: 'C',
    tags: [],
    canzoniereSlug: 'repertorio',
    body,
    updatedAt,
  }
}

function entry(slug: string, title: string, updatedAt: string | null): SongIndexEntry {
  return {
    slug,
    title,
    artist: 'Ligabue',
    originalKey: 'C',
    tags: [],
    updatedAt,
    haystack: `${title}\nligabue\ncerte notti la macchina`.toLowerCase(),
  }
}

function row(slug: string, title: string, updatedAt: string | null): SongIndexRow {
  return { slug, title, artist: 'Ligabue', originalKey: 'C', tags: [], updatedAt }
}

describe('isNewer', () => {
  it('accepts a later version', () => {
    assert.equal(isNewer({ updatedAt: LATER }, { updatedAt: BUILT }), true)
  })

  it('rejects an earlier one', () => {
    assert.equal(isNewer({ updatedAt: BUILT }, { updatedAt: LATER }), false)
  })

  /** The rule that stops an overlay entry from outliving the build that baked it in. */
  it('does not count the same version as newer', () => {
    assert.equal(isNewer({ updatedAt: BUILT }, { updatedAt: BUILT }), false)
  })

  it('compares the instants, not the digits', () => {
    // 09:00 sorts after 10:00 only if you compare the wrong way round.
    assert.equal(
      isNewer({ updatedAt: '2026-08-11T10:00:00.000Z' }, { updatedAt: '2026-08-11T09:00:00.000Z' }),
      true,
    )
    assert.equal(
      isNewer({ updatedAt: '2026-08-11T09:00:00.000Z' }, { updatedAt: '2026-08-11T10:00:00.000Z' }),
      false,
    )
  })

  it('treats a page built without a database as older than anything', () => {
    assert.equal(isNewer({ updatedAt: BUILT }, { updatedAt: null }), true)
  })

  it('never prefers a version that cannot say when it was written', () => {
    assert.equal(isNewer({ updatedAt: null }, { updatedAt: BUILT }), false)
    assert.equal(isNewer({ updatedAt: null }, { updatedAt: null }), false)
  })
})

describe('pick', () => {
  it('shows an edit made after the build', () => {
    const edited = song(LATER, 'corretto')
    assert.equal(pick(song(BUILT), edited).body, 'corretto')
  })

  it('drops the edit once the build has caught up', () => {
    // What the browser cached is now exactly what the page ships.
    const cached = song(BUILT, 'corretto')
    assert.equal(pick(song(BUILT, 'corretto'), cached).updatedAt, BUILT)
    assert.equal(pick(song(LATER, 'più recente'), cached).body, 'più recente')
  })

  it('ignores nothing at all', () => {
    assert.equal(pick(song(BUILT), null).body, 'originale')
    assert.equal(pick(song(BUILT), undefined).body, 'originale')
  })

  it('ignores a candidate for a different song', () => {
    const other = { ...song(LATER, 'un altro brano'), slug: 'balla-linda' }
    assert.equal(pick(song(BUILT), other).body, 'originale')
  })
})

describe('mergeIndex', () => {
  it('keeps a row the build already had, haystack and all', () => {
    const baked = [entry('certe-notti', 'Certe notti', BUILT)]
    const merged = mergeIndex(baked, [row('certe-notti', 'Certe notti', BUILT)])

    assert.deepEqual(merged, baked)
  })

  it('shows a new title, and keeps the lyrics searchable', () => {
    const merged = mergeIndex(
      [entry('certe-notti', 'Certe notti', BUILT)],
      [row('certe-notti', 'Certe notti (live)', LATER)],
    )

    assert.equal(merged[0].title, 'Certe notti (live)')
    assert.equal(merged[0].updatedAt, LATER)
    assert.ok(merged[0].haystack.includes('certe notti (live)'))
    assert.ok(merged[0].haystack.includes('la macchina'))
  })

  it('adds a song imported since the build', () => {
    const merged = mergeIndex([], [row('balla-linda', 'Balla Linda', LATER)])

    assert.equal(merged.length, 1)
    assert.equal(merged[0].slug, 'balla-linda')
    // Its lyrics are not in this browser yet, but its title matches.
    assert.equal(merged[0].haystack, 'balla linda\nligabue\n\n')
    assert.ok(merged[0].haystack.includes('balla linda'))
  })

  it('drops a song deleted since the build', () => {
    const merged = mergeIndex(
      [entry('certe-notti', 'Certe notti', BUILT), entry('balla-linda', 'Balla Linda', BUILT)],
      [row('certe-notti', 'Certe notti', BUILT)],
    )

    assert.deepEqual(
      merged.map((song) => song.slug),
      ['certe-notti'],
    )
  })

  it('takes its order from the database, so a retitled song sorts by its new title', () => {
    const baked = [entry('aaa', 'Aaa', BUILT), entry('zzz', 'Zzz', BUILT)]
    const merged = mergeIndex(baked, [
      row('zzz', 'Aaa bis', LATER),
      row('aaa', 'Aaa', BUILT),
    ])

    assert.deepEqual(
      merged.map((song) => song.title),
      ['Aaa bis', 'Aaa'],
    )
  })

  it('leaves the list alone when nothing has changed', () => {
    const baked = [entry('aaa', 'Aaa', BUILT), entry('zzz', 'Zzz', BUILT)]
    const merged = mergeIndex(baked, [row('aaa', 'Aaa', BUILT), row('zzz', 'Zzz', BUILT)])

    assert.deepEqual(merged, baked)
  })
})

describe('liveHaystack', () => {
  it('folds title, artist and tags into one lowercased string', () => {
    const built = liveHaystack({ ...row('x', 'Certe Notti', LATER), tags: ['Rock', 'Anni 90'] })

    assert.ok(built.includes('certe notti'))
    assert.ok(built.includes('rock anni 90'))
  })
})
