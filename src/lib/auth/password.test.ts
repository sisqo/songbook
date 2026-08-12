import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  hashPassword,
  isPasswordAcceptable,
  verifyAgainstNothing,
  verifyPassword,
} from './password'
import { MAX_PASSWORD, MIN_PASSWORD } from './types'

const PASSWORD = 'una password lunga abbastanza'

describe('hashing a password', () => {
  it('accepts the password that made the hash', async () => {
    assert.equal(await verifyPassword(PASSWORD, await hashPassword(PASSWORD)), true)
  })

  it('refuses anything else, including a prefix of it', async () => {
    const stored = await hashPassword(PASSWORD)
    assert.equal(await verifyPassword('un altra password', stored), false)
    assert.equal(await verifyPassword(PASSWORD.slice(0, -1), stored), false)
    assert.equal(await verifyPassword(`${PASSWORD} `, stored), false)
    assert.equal(await verifyPassword('', stored), false)
  })

  /*
   * Two hashes of one password must differ, or the column would say which people share a
   * password — and one stolen row would answer for all of them.
   */
  it('salts, so the same password twice is not the same hash', async () => {
    const [one, other] = [await hashPassword(PASSWORD), await hashPassword(PASSWORD)]
    assert.notEqual(one, other)
    assert.equal(await verifyPassword(PASSWORD, one), true)
    assert.equal(await verifyPassword(PASSWORD, other), true)
  })

  it('writes its parameters into the stored form', async () => {
    const stored = await hashPassword(PASSWORD)
    const [kind, n, r, p, salt, hash] = stored.split('$')
    assert.equal(kind, 'scrypt')
    assert.deepEqual([n, r, p], ['16384', '8', '1'])
    assert.ok(Buffer.from(salt, 'base64').length >= 16)
    assert.equal(Buffer.from(hash, 'base64').length, 64)
  })

  /*
   * The format exists so the numbers can be raised later. A row written with different ones
   * has to keep working, or every password in the table would break on the day it changes.
   */
  it('verifies a row written with other parameters', async () => {
    const stored = await hashPassword(PASSWORD)
    const weaker = stored.replace('$16384$8$1$', '$1024$8$1$')
    // Not the same hash, so it must fail — but by answering, not by throwing.
    assert.equal(await verifyPassword(PASSWORD, weaker), false)
  })

  it('answers false for a stored value it cannot read', async () => {
    for (const broken of ['', 'garbage', 'scrypt$x$8$1$aa$bb', 'bcrypt$16384$8$1$aa$bb', 'scrypt$16384$8$1$aa']) {
      assert.equal(await verifyPassword(PASSWORD, broken), false, broken)
    }
  })

  it('spends the same effort when there is nothing to compare against', async () => {
    // The point is that it answers false having done the work, not that it is fast.
    assert.equal(await verifyAgainstNothing(PASSWORD), false)
  })
})

describe('what counts as a password', () => {
  it('asks for length and nothing else', () => {
    assert.equal(isPasswordAcceptable('a'.repeat(MIN_PASSWORD)), true)
    assert.equal(isPasswordAcceptable('a'.repeat(MIN_PASSWORD - 1)), false)
    assert.equal(isPasswordAcceptable('a'.repeat(MAX_PASSWORD)), true)
    assert.equal(isPasswordAcceptable('a'.repeat(MAX_PASSWORD + 1)), false)
    assert.equal(isPasswordAcceptable(''), false)
  })

  it('has no opinion about what is in it', () => {
    assert.equal(isPasswordAcceptable('tutte minuscole senza numeri'), true)
    assert.equal(isPasswordAcceptable('               '), true, 'spaces are characters')
  })
})
