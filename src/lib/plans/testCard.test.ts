import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ACCEPTED_TEST_CARD, isAcceptedTestCard } from './testCard'

describe('isAcceptedTestCard', () => {
  it('accepts the one number the test checkout is meant to succeed with', () => {
    assert.equal(isAcceptedTestCard(ACCEPTED_TEST_CARD), true)
  })

  it('ignores how the digits are spaced or punctuated', () => {
    assert.equal(isAcceptedTestCard('4111111111111111'), true)
    assert.equal(isAcceptedTestCard('4111-1111-1111-1111'), true)
    assert.equal(isAcceptedTestCard('  4111 1111 1111 1111  '), true)
  })

  it('declines every other number, including the previous default and an empty field', () => {
    assert.equal(isAcceptedTestCard('4242 4242 4242 4242'), false)
    assert.equal(isAcceptedTestCard(''), false)
    assert.equal(isAcceptedTestCard('4111 1111 1111 1112'), false)
  })
})
