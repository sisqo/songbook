import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChord } from './chord'
import { mod12 } from './notes'
import {
  FAMILIES,
  candidates,
  chordNoteNames,
  familyOf,
  shapeFor,
  shapeNotes,
} from './shapes'

/**
 * Checks a shape really is a voicing of the chord it is filed under.
 *
 * Two directions, and both matter. No foreign note, or the shape is a different
 * chord; and every required tone present, or it is not that chord either — a
 * root and a fifth fit inside major, minor and seventh alike.
 */
function assertVoicing(root: number, family: string, frets: (number | null)[], where: string) {
  const spec = FAMILIES[family]
  const allowed = new Set(spec.intervals.map((interval) => mod12(root + interval)))
  const sounded = new Set(shapeNotes(frets))

  for (const note of sounded) {
    assert.ok(allowed.has(note), `${where}: note ${note} is not in ${family || 'major'}`)
  }
  for (const interval of spec.required) {
    assert.ok(
      sounded.has(mod12(root + interval)),
      `${where}: missing the interval ${interval} of ${family || 'major'}`,
    )
  }
}

describe('every shape is a voicing of its chord', () => {
  it('holds for all twelve roots of every family', () => {
    let checked = 0

    for (const family of Object.keys(FAMILIES)) {
      for (let root = 0; root < 12; root += 1) {
        const options = candidates(root, family)
        assert.ok(options.length > 0, `no shape at all for ${root}:${family}`)

        options.forEach((frets, index) => {
          assertVoicing(root, family, frets, `${root}:${family || 'major'} candidate ${index}`)
          checked += 1
        })
      }
    }

    // Guards against the loop silently covering nothing.
    assert.ok(checked > 300, `only ${checked} shapes checked`)
  })

  it('never asks for a fret past the twelfth or a negative one', () => {
    for (const family of Object.keys(FAMILIES)) {
      for (let root = 0; root < 12; root += 1) {
        const shape = shapeFor({ root, rootName: 'C', suffix: family, bass: null, bassName: null })
        assert.ok(shape !== null)

        for (const fret of shape.frets) {
          if (fret === null) continue
          assert.ok(fret >= 0 && fret <= 15, `${root}:${family} reaches fret ${fret}`)
        }
      }
    }
  })
})

describe('shapeFor', () => {
  const shapeOf = (token: string) => {
    const chord = parseChord(token)
    assert.ok(chord !== null, `${token} did not parse`)
    return shapeFor(chord)
  }

  it('answers the open position for the chords that have one', () => {
    assert.deepEqual(shapeOf('C')?.frets, [null, 3, 2, 0, 1, 0])
    assert.deepEqual(shapeOf('G')?.frets, [3, 2, 0, 0, 0, 3])
    assert.deepEqual(shapeOf('D')?.frets, [null, null, 0, 2, 3, 2])
    assert.deepEqual(shapeOf('Dm')?.frets, [null, null, 0, 2, 3, 1])
    assert.deepEqual(shapeOf('E')?.frets, [0, 2, 2, 1, 0, 0])
    assert.deepEqual(shapeOf('Am')?.frets, [null, 0, 2, 2, 1, 0])
  })

  it('picks the lower of the two movable forms', () => {
    // Bb major: sixth-string form sits at the sixth fret, fifth-string at the first.
    assert.deepEqual(shapeOf('Bb')?.frets, [null, 1, 3, 3, 3, 1])
    // F major has no open shape, and the sixth-string form is the first fret.
    assert.deepEqual(shapeOf('F')?.frets, [1, 3, 3, 2, 1, 1])
  })

  it('reads an enharmonic spelling as the same chord', () => {
    assert.deepEqual(shapeOf('A#m')?.frets, shapeOf('Bbm')?.frets)
  })

  it('keeps the shape of the base chord for a slash chord', () => {
    assert.deepEqual(shapeOf('C/G')?.frets, shapeOf('C')?.frets)
  })

  it('has nothing to draw for a suffix outside the table', () => {
    assert.equal(shapeOf('Calt'), null)
  })
})

describe('familyOf', () => {
  it('passes through what the table already carries', () => {
    assert.deepEqual(familyOf('m7'), { family: 'm7', simplified: false })
    assert.deepEqual(familyOf(''), { family: '', simplified: false })
    assert.deepEqual(familyOf('sus4'), { family: 'sus4', simplified: false })
  })

  it('normalises the spellings the parser leaves alone', () => {
    assert.equal(familyOf('min7')?.family, 'm7')
    assert.equal(familyOf('Δ7')?.family, 'maj7')
    assert.equal(familyOf('°7')?.family, 'dim7')
    assert.equal(familyOf('sus')?.family, 'sus4')
  })

  it('admits when it simplifies', () => {
    // A thirteenth is drawn as the dominant seventh underneath it.
    assert.deepEqual(familyOf('13'), { family: '7', simplified: true })
    assert.deepEqual(familyOf('7b9'), { family: '7', simplified: true })
    assert.deepEqual(familyOf('m11'), { family: 'm7', simplified: true })
  })

  it('only ever omits a note, never contradicts one', () => {
    // A flat or sharp fifth would still be sounded natural by every shape here.
    assert.equal(familyOf('7b5'), null)
    assert.equal(familyOf('7#5'), null)
    // A sixth-ninth has no seventh, so the ninth family would add a foreign note.
    assert.equal(familyOf('6/9')?.family, 'add9')
    assert.equal(familyOf('madd9')?.family, 'm')
    assert.equal(familyOf('add11')?.family, '')
  })

  it('does not mistake a major seventh for a minor', () => {
    assert.equal(familyOf('maj7')?.family, 'maj7')
    assert.equal(familyOf('m7b5')?.family, 'm7b5')
  })

  it('gives up rather than guess', () => {
    assert.equal(familyOf('alt'), null)
  })
})

describe('chordNoteNames', () => {
  const notesOf = (token: string) => {
    const chord = parseChord(token)
    assert.ok(chord !== null)
    return chordNoteNames(chord)
  }

  it('spells the chord the way the chord is written', () => {
    assert.deepEqual(notesOf('Bb'), ['Bb', 'D', 'F'])
    assert.deepEqual(notesOf('A'), ['A', 'C#', 'E'])
  })

  it('names the seventh and the ninth', () => {
    assert.deepEqual(notesOf('Am7'), ['A', 'C', 'E', 'G'])
  })

  it('adds a slash bass that is not already in the chord', () => {
    assert.deepEqual(notesOf('C/G'), ['C', 'E', 'G'])
    assert.deepEqual(notesOf('C/B'), ['C', 'E', 'G', 'B'])
  })

  it('still names the root when the suffix is unknown', () => {
    assert.deepEqual(notesOf('Calt'), ['C'])
  })
})
