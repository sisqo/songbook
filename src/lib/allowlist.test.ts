import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAllowed, isEmailShape, isOwner, normalizeEmail, parseAllowlist } from './allowlist'

describe('parseAllowlist', () => {
  it('splits, trims and lowercases', () => {
    assert.deepEqual(parseAllowlist(' A@x.it , B@Y.IT '), ['a@x.it', 'b@y.it'])
  })

  it('drops empty entries left by stray commas', () => {
    assert.deepEqual(parseAllowlist('a@x.it,,'), ['a@x.it'])
  })

  it('treats missing configuration as an empty list', () => {
    assert.deepEqual(parseAllowlist(undefined), [])
    assert.deepEqual(parseAllowlist(''), [])
  })
})

describe('isAllowed', () => {
  const owners = 'f.limberti@3nd.it, altro@example.com'

  it('admits addresses from the environment, whatever their case', () => {
    assert.equal(isAllowed('f.limberti@3nd.it', owners), true)
    assert.equal(isAllowed('F.Limberti@3nd.IT', owners), true)
    assert.equal(isAllowed(' altro@example.com ', owners), true)
  })

  it('rejects a valid account on neither side', () => {
    assert.equal(isAllowed('sconosciuto@gmail.com', owners, ['chi@example.com']), false)
  })

  /*
   * The four cases the union exists for. The third is the one that matters after a
   * deploy: the owners are not rows in the table, so a guard that only read the table
   * would stop the only two people who have access from saving anything.
   */
  it('admits from either half, and from neither when both are empty', () => {
    assert.equal(isAllowed('a@x.it', 'a@x.it', []), true, 'environment only')
    assert.equal(isAllowed('b@x.it', '', ['b@x.it']), true, 'table only')
    assert.equal(isAllowed('a@x.it', 'a@x.it', ['b@x.it']), true, 'in both halves')
    assert.equal(isAllowed('a@x.it', '', []), false, 'neither')
  })

  it('compares table entries case-insensitively too', () => {
    assert.equal(isAllowed('Chi@Example.COM', '', ['chi@example.com']), true)
    assert.equal(isAllowed('chi@example.com', '', [' Chi@Example.COM ']), true)
  })

  it('fails closed when nothing is configured', () => {
    // A forgotten environment variable must not publish the repertoire.
    assert.equal(isAllowed('f.limberti@3nd.it', undefined), false)
    assert.equal(isAllowed('f.limberti@3nd.it', ''), false)
    assert.equal(isAllowed('f.limberti@3nd.it', '  ,  '), false)
    assert.equal(isAllowed('f.limberti@3nd.it', '', []), false)
  })

  it('rejects a missing email', () => {
    assert.equal(isAllowed(null, owners), false)
    assert.equal(isAllowed(undefined, owners), false)
    assert.equal(isAllowed('', owners), false)
  })
})

describe('isOwner', () => {
  it('is true only for the environment half', () => {
    assert.equal(isOwner('a@x.it', 'a@x.it'), true)
    assert.equal(isOwner('A@X.it', ' a@x.it '), true)
    assert.equal(isOwner('b@x.it', 'a@x.it'), false)
    assert.equal(isOwner('b@x.it', undefined), false)
    assert.equal(isOwner(null, 'a@x.it'), false)
  })
})

describe('isEmailShape', () => {
  it('accepts an address', () => {
    assert.equal(isEmailShape('qualcuno@example.com'), true)
    assert.equal(isEmailShape(' Qualcuno@Example.Com '), true)
  })

  it('rejects what is plainly not one', () => {
    assert.equal(isEmailShape('qualcuno'), false)
    assert.equal(isEmailShape('qualcuno@example'), false)
    assert.equal(isEmailShape('qualcuno@'), false)
    assert.equal(isEmailShape('@example.com'), false)
    assert.equal(isEmailShape('due indirizzi@example.com'), false)
    assert.equal(isEmailShape(''), false)
  })
})

describe('normalizeEmail', () => {
  it('is what every comparison goes through', () => {
    assert.equal(normalizeEmail('  Qualcuno@Example.COM '), 'qualcuno@example.com')
  })
})
