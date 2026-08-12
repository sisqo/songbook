import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    assert.equal(slugify('Da imparare'), 'da-imparare')
    assert.equal(slugify('Repertorio'), 'repertorio')
  })

  it('folds accents instead of dropping the letter', () => {
    assert.equal(slugify('Perché però'), 'perche-pero')
    assert.equal(slugify('Città'), 'citta')
  })

  it('collapses punctuation and trims stray dashes', () => {
    assert.equal(slugify('  Natale / Capodanno!  '), 'natale-capodanno')
    assert.equal(slugify('--già--'), 'gia')
  })

  it('returns an empty string when nothing survives', () => {
    assert.equal(slugify('!!!'), '')
  })
})

describe('uniqueSlug', () => {
  it('uses the plain slug when it is free', () => {
    assert.equal(uniqueSlug('Repertorio', []), 'repertorio')
  })

  it('suffixes rather than refusing a duplicate name', () => {
    assert.equal(uniqueSlug('Repertorio', ['repertorio']), 'repertorio-2')
    assert.equal(uniqueSlug('Repertorio', ['repertorio', 'repertorio-2']), 'repertorio-3')
  })

  it('falls back to a usable slug when the name has no letters', () => {
    assert.equal(uniqueSlug('!!!', []), 'songbook')
    assert.equal(uniqueSlug('!!!', ['songbook']), 'songbook-2')
  })
})
