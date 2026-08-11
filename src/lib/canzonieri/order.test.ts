import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Band, applyOrder, bandAt, moveItem, sameMembers } from './order'

describe('moving one song to another place', () => {
  const list = ['a', 'b', 'c', 'd']

  it('carries it down the list', () => {
    assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd'])
  })

  it('and up it', () => {
    assert.deepEqual(moveItem(list, 3, 1), ['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone when it lands where it started', () => {
    assert.equal(moveItem(list, 2, 2), list)
  })

  it('stops at the ends instead of falling off them', () => {
    assert.deepEqual(moveItem(list, 1, -3), ['b', 'a', 'c', 'd'])
    assert.deepEqual(moveItem(list, 1, 9), ['a', 'c', 'd', 'b'])
  })

  it('never mutates what it was given', () => {
    const before = [...list]
    moveItem(list, 0, 3)
    assert.deepEqual(list, before)
  })
})

describe('whether two lists hold the same songs', () => {
  it('says yes to a reordering', () => {
    assert.equal(sameMembers(['a', 'b', 'c'], ['c', 'a', 'b']), true)
  })

  it('says no to a missing one, an extra one, or a swap', () => {
    assert.equal(sameMembers(['a', 'b'], ['a']), false)
    assert.equal(sameMembers(['a'], ['a', 'b']), false)
    assert.equal(sameMembers(['a', 'b'], ['a', 'c']), false)
  })

  it('is not fooled by a repeat', () => {
    // Two lists of the same length holding the same *set* but not the same members.
    assert.equal(sameMembers(['a', 'a', 'b'], ['a', 'b', 'b']), false)
  })

  it('says yes to two empty lists', () => {
    assert.equal(sameMembers([], []), true)
  })
})

describe('putting a saved order back into the whole list', () => {
  /** Two canzonieri interleaved, which is what a list sorted some other way looks like. */
  const all = [
    { slug: 'a1' },
    { slug: 'b1' },
    { slug: 'a2' },
    { slug: 'b2' },
    { slug: 'a3' },
  ]

  it('refills the slots of the songs it was given', () => {
    assert.deepEqual(
      applyOrder(all, ['a3', 'a1', 'a2']).map((item) => item.slug),
      ['a3', 'b1', 'a1', 'b2', 'a2'],
    )
  })

  it('leaves the other canzoniere exactly where it was', () => {
    const after = applyOrder(all, ['a3', 'a2', 'a1'])
    assert.equal(after[1].slug, 'b1')
    assert.equal(after[3].slug, 'b2')
  })

  it('refuses an order that names something the list has not got', () => {
    assert.equal(applyOrder(all, ['a1', 'a2', 'zz']), all)
  })

  it('rearranges only the names it was given, in their own slots', () => {
    /*
     * A short list is not an error here: this function cannot know that `a2` belongs
     * to the same canzoniere as `a1` and `a3`. Refusing a partial order is the
     * server's job, where the canzoniere's real membership is known — see the `stale`
     * check in `reorderCanzoniere`.
     */
    assert.deepEqual(
      applyOrder(all, ['a3', 'a1']).map((item) => item.slug),
      ['a3', 'b1', 'a2', 'b2', 'a1'],
    )
  })
})

describe('which row the finger is over', () => {
  /** Three rows of unequal height, as a song with an artist is taller than one without. */
  const bands: Band[] = [
    { top: 100, bottom: 140 },
    { top: 140, bottom: 200 },
    { top: 200, bottom: 240 },
  ]

  it('finds the row a point falls in', () => {
    assert.equal(bandAt(bands, 120), 0)
    assert.equal(bandAt(bands, 170), 1)
    assert.equal(bandAt(bands, 230), 2)
  })

  it('gives a boundary to the row below it, so the two never both claim it', () => {
    assert.equal(bandAt(bands, 140), 1)
    assert.equal(bandAt(bands, 200), 2)
  })

  it('clamps above the first row and below the last', () => {
    assert.equal(bandAt(bands, -500), 0)
    assert.equal(bandAt(bands, 5000), 2)
  })

  it('answers something for an empty list', () => {
    assert.equal(bandAt([], 42), 0)
  })
})
