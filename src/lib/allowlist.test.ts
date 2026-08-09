import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAllowed, parseAllowlist } from './allowlist'

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
  const list = 'f.limberti@3nd.it, altro@example.com'

  it('admits addresses on the list, whatever their case', () => {
    assert.equal(isAllowed('f.limberti@3nd.it', list), true)
    assert.equal(isAllowed('F.Limberti@3nd.IT', list), true)
    assert.equal(isAllowed(' altro@example.com ', list), true)
  })

  it('rejects a valid account that is not on the list', () => {
    assert.equal(isAllowed('sconosciuto@gmail.com', list), false)
  })

  it('fails closed when the list is missing', () => {
    // A forgotten environment variable must not publish the repertoire.
    assert.equal(isAllowed('f.limberti@3nd.it', undefined), false)
    assert.equal(isAllowed('f.limberti@3nd.it', ''), false)
    assert.equal(isAllowed('f.limberti@3nd.it', '  ,  '), false)
  })

  it('rejects a missing email', () => {
    assert.equal(isAllowed(null, list), false)
    assert.equal(isAllowed(undefined, list), false)
    assert.equal(isAllowed('', list), false)
  })
})
