import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canEdit, isAdmitted, roleOf } from './roles'

const OWNERS = 'padrone@x.it, altro@x.it'
const ACCOUNT = 'conto@x.it'

describe('roleOf', () => {
  it('makes a global owner admin on any account', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, ACCOUNT), 'admin')
    assert.equal(roleOf('PADRONE@X.IT', OWNERS, ACCOUNT), 'admin', 'case should not matter')
    assert.equal(roleOf('padrone@x.it', OWNERS, 'someone-elses-account@x.it'), 'admin')
  })

  it('makes an account owner admin on their own account, and nothing else', () => {
    assert.equal(roleOf(ACCOUNT, OWNERS, ACCOUNT), 'admin')
    assert.equal(roleOf('CONTO@X.IT', OWNERS, ACCOUNT), 'admin', 'case should not matter')
    assert.equal(roleOf(ACCOUNT, OWNERS, 'other@x.it'), null, 'not admin on someone else’s')
  })

  it('is null for someone who owns neither, globally nor of this account', () => {
    assert.equal(roleOf('nessuno@x.it', OWNERS, ACCOUNT), null)
    assert.equal(roleOf(null, OWNERS, ACCOUNT), null)
    assert.equal(roleOf('', OWNERS, ACCOUNT), null)
  })

  it('refuses everyone when no owners are configured', () => {
    assert.equal(roleOf('padrone@x.it', undefined, ACCOUNT), null)
    assert.equal(roleOf('padrone@x.it', '', ACCOUNT), null)
  })
})

describe('isAdmitted', () => {
  /*
   * The property the whole design rests on: with no members table left to hold a stray
   * row, the only way in is being an owner — global or of one's own account — or already
   * having one. Nothing can take that away from a global owner, not even the absence of
   * the very account row this function otherwise requires.
   */
  it('admits a global owner even with no account of their own yet', () => {
    assert.equal(isAdmitted('padrone@x.it', OWNERS, false), true)
    assert.equal(isAdmitted('PADRONE@X.IT', OWNERS, true), true)
  })

  it('admits anyone who already has an account', () => {
    assert.equal(isAdmitted(ACCOUNT, OWNERS, true), true)
  })

  it('refuses whoever is neither an owner nor has an account yet', () => {
    assert.equal(isAdmitted('nessuno@x.it', OWNERS, false), false)
    assert.equal(isAdmitted(null, OWNERS, true), false)
  })
})

describe('canEdit', () => {
  it('lets only admin change the repertoire', () => {
    assert.equal(canEdit('admin'), true)
    assert.equal(canEdit(null), false)
  })
})
