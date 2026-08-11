import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { prepareSongs } from './prepare'
import { splitSongs } from './split'

describe('splitting a paste into songs', () => {
  it('leaves one song alone', () => {
    const source = '[la]Prima riga\n\n[mi]Seconda riga'
    assert.deepEqual(splitSongs(source), [source])
  })

  it('finds nothing in an empty paste', () => {
    assert.deepEqual(splitSongs(''), [])
    assert.deepEqual(splitSongs('  \n\n \n'), [])
  })

  it('cuts on a rule and keeps neither side of it', () => {
    assert.deepEqual(splitSongs('Uno\n---\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n=====\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n***\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n___\nDue'), ['Uno', 'Due'])
  })

  it('needs three characters to call something a rule', () => {
    // "--" is a dash in the lyrics, not a separator.
    assert.deepEqual(splitSongs('Uno\n--\nDue'), ['Uno\n--\nDue'])
  })

  it('cuts on ChordPro’s own separator', () => {
    assert.deepEqual(splitSongs('Uno\n{ns}\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n{new_song}\nDue'), ['Uno', 'Due'])
    assert.deepEqual(splitSongs('Uno\n{NS}\nDue'), ['Uno', 'Due'])
  })

  it('cuts before a second title and keeps it with its own song', () => {
    const pasted = ['{title: Uno}', '[la]uno', '', '{title: Due}', '[mi]due'].join('\n')

    assert.deepEqual(splitSongs(pasted), [
      '{title: Uno}\n[la]uno',
      '{title: Due}\n[mi]due',
    ])
  })

  it('does not open with an empty song when the paste starts with a title', () => {
    assert.deepEqual(splitSongs('{t: Uno}\n[la]uno'), ['{t: Uno}\n[la]uno'])
  })

  it('treats a page break as a rule, for text pulled out of a PDF', () => {
    assert.deepEqual(splitSongs('Uno\n\fDue'), ['Uno', 'Due'])
  })

  it('drops what falls between two marks', () => {
    assert.deepEqual(splitSongs('Uno\n---\n\n---\nDue'), ['Uno', 'Due'])
  })

  it('ignores the other directives', () => {
    // Only the title says "new song"; a subtitle or a key does not.
    const pasted = '{title: Uno}\n{subtitle: Tizio}\n{key: C}\n[la]uno'
    assert.deepEqual(splitSongs(pasted), [pasted])
  })

  it('leaves the words of the songs untouched', () => {
    const first = ['Certe notti', 'Ligabue', '', 'Am        F', 'Certe notti la macchina'].join('\n')
    const second = ['Vasco', '', 'C         G', 'Albachiara'].join('\n')

    assert.deepEqual(splitSongs(`${first}\n\n---\n\n${second}`), [first, second])
  })
})

describe('preparing what was pasted', () => {
  /** Two songs in one paste, in the format a chord site gives you. */
  const pasted = [
    'Certe notti',
    'Ligabue',
    '',
    'Am        F',
    'Certe notti la macchina',
    '',
    '---',
    '',
    'Albachiara',
    'Vasco Rossi',
    '',
    'C       G',
    'Respiri piano',
  ].join('\n')

  it('reads a title, an artist and a body out of each piece', () => {
    const songs = prepareSongs(pasted)

    assert.deepEqual(
      songs.map((song) => [song.title, song.artist]),
      [
        ['Certe notti', 'Ligabue'],
        ['Albachiara', 'Vasco Rossi'],
      ],
    )

    // The heading is consumed, so the words start at the words. The `F` lands on
    // the column it was written in, which is under the last letter of "notti".
    assert.equal(songs[0].body, '[Am]Certe nott[F]i la macchina')
    assert.equal(songs[1].body, '[C]Respiri [G]piano')
  })

  it('gives each song its own key, since one paste is not one song', () => {
    const songs = prepareSongs(pasted)

    assert.deepEqual(songs.map((song) => song.id), [0, 1])
    assert.deepEqual(songs.map((song) => song.format), ['chords-above', 'chords-above'])
    // Neither source declared a key, so both are estimates from the chords.
    assert.deepEqual(songs.map((song) => song.keyIsGuess), [true, true])
  })

  it('repeats what a song says about its canzoniere without acting on it', () => {
    const songs = prepareSongs('{title: Uno}\n{canzoniere: Cartoni animati}\n[la]uno\n---\n{title: Due}\n[mi]due')

    assert.deepEqual(songs.map((song) => song.declares), ['Cartoni animati', null])
  })

  it('finds nothing to prepare in an empty paste', () => {
    assert.deepEqual(prepareSongs('\n \n'), [])
  })
})
