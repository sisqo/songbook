import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Membership, ROLES, canEdit, canManageUsers, readRole, roleOf } from './roles'

const OWNERS = 'padrone@x.it, altro@x.it'

const at = (email: string, role: string): Membership => ({ email, role: readRole(role) })

describe('roleOf', () => {
  it('makes an owner admin without consulting the table', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, []), 'admin')
    assert.equal(roleOf('PADRONE@X.IT', OWNERS, null), 'admin')
  })

  /*
   * The property the whole design rests on: a row cannot take an owner's powers away.
   * Somebody adding `padrone@x.it` as a viewer — which `addMember` refuses anyway — still
   * must not be able to demote them.
   */
  it('lets no row demote an owner', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, [at('padrone@x.it', 'viewer')]), 'admin')
  })

  it('gives an invited member the role the table says', () => {
    const table = [at('a@x.it', 'admin'), at('e@x.it', 'editor'), at('v@x.it', 'viewer')]
    assert.equal(roleOf('a@x.it', OWNERS, table), 'admin')
    assert.equal(roleOf('e@x.it', OWNERS, table), 'editor')
    assert.equal(roleOf('v@x.it', OWNERS, table), 'viewer')
    assert.equal(roleOf('E@X.it', OWNERS, table), 'editor', 'case should not matter')
  })

  it('is null for someone on neither side', () => {
    assert.equal(roleOf('nessuno@x.it', OWNERS, [at('v@x.it', 'viewer')]), null)
    assert.equal(roleOf('nessuno@x.it', OWNERS, []), null)
    assert.equal(roleOf(null, OWNERS, []), null)
    assert.equal(roleOf('', OWNERS, []), null)
  })

  it('admits only the owners when the table did not answer', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, null), 'admin')
    assert.equal(roleOf('e@x.it', OWNERS, null), null)
  })

  it('refuses everyone when nothing is configured', () => {
    assert.equal(roleOf('padrone@x.it', undefined, null), null)
    assert.equal(roleOf('padrone@x.it', '', []), null)
  })

  it('reads a role the database should not hold as the least of them', () => {
    assert.equal(roleOf('x@x.it', OWNERS, [{ email: 'x@x.it', role: 'superuser' as never }]), 'viewer')
  })
})

describe('readRole', () => {
  it('keeps the three that exist', () => {
    for (const role of ROLES) assert.equal(readRole(role), role)
  })

  it('falls back to viewer for anything else', () => {
    assert.equal(readRole(null), 'viewer')
    assert.equal(readRole(undefined), 'viewer')
    assert.equal(readRole(''), 'viewer')
    assert.equal(readRole('Admin'), 'viewer', 'case is not normalised: the column is written by us')
    assert.equal(readRole('root'), 'viewer')
  })
})

describe('what each role may do', () => {
  it('lets admin and editor change the repertoire', () => {
    assert.equal(canEdit('admin'), true)
    assert.equal(canEdit('editor'), true)
    assert.equal(canEdit('viewer'), false)
    assert.equal(canEdit(null), false)
  })

  it('lets only admin change who enters', () => {
    assert.equal(canManageUsers('admin'), true)
    assert.equal(canManageUsers('editor'), false)
    assert.equal(canManageUsers('viewer'), false)
    assert.equal(canManageUsers(null), false)
  })

  /*
   * Stated as a test because it is the line the whole feature draws: an editor is not a
   * lesser admin, they are someone with no say over the door.
   */
  it('never lets editing imply managing users', () => {
    for (const role of ROLES) {
      if (canManageUsers(role)) assert.equal(canEdit(role), true, `${role} manages but cannot edit`)
    }
    assert.equal(canEdit('editor') && !canManageUsers('editor'), true)
  })
})
