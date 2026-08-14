import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MEMBER_ROLES,
  type Membership,
  canEdit,
  canManageUsers,
  isAdmitted,
  readRole,
  roleOf,
} from './roles'

const OWNERS = 'padrone@x.it, altro@x.it'
const ACCOUNT = 'conto@x.it'

const at = (email: string, role: string): Membership => ({
  accountOwnerEmail: ACCOUNT,
  email,
  role: readRole(role),
})

describe('roleOf', () => {
  it('makes a global owner admin on any account without consulting the table', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, ACCOUNT, []), 'admin')
    assert.equal(roleOf('PADRONE@X.IT', OWNERS, ACCOUNT, null), 'admin')
    assert.equal(roleOf('padrone@x.it', OWNERS, 'someone-elses-account@x.it', []), 'admin')
  })

  it('makes an account owner admin on their own account, and nothing else', () => {
    assert.equal(roleOf(ACCOUNT, OWNERS, ACCOUNT, []), 'admin')
    assert.equal(roleOf('CONTO@X.IT', OWNERS, ACCOUNT, null), 'admin', 'case should not matter')
    assert.equal(roleOf(ACCOUNT, OWNERS, 'other@x.it', []), null, 'not admin on someone else’s')
  })

  /*
   * The property the whole design rests on: a row cannot take an owner's powers away.
   * Somebody adding `padrone@x.it` as a viewer — which `addMember` refuses anyway — still
   * must not be able to demote them.
   */
  it('lets no row demote an owner', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, ACCOUNT, [at('padrone@x.it', 'viewer')]), 'admin')
    assert.equal(roleOf(ACCOUNT, OWNERS, ACCOUNT, [at(ACCOUNT, 'viewer')]), 'admin')
  })

  it('gives an invited collaborator the role the table says, scoped to that account', () => {
    const table = [at('e@x.it', 'editor'), at('v@x.it', 'viewer')]
    assert.equal(roleOf('e@x.it', OWNERS, ACCOUNT, table), 'editor')
    assert.equal(roleOf('v@x.it', OWNERS, ACCOUNT, table), 'viewer')
    assert.equal(roleOf('E@X.it', OWNERS, ACCOUNT, table), 'editor', 'case should not matter')
  })

  it('does not carry a membership over to an account it was not granted on', () => {
    const table = [at('e@x.it', 'editor')]
    assert.equal(roleOf('e@x.it', OWNERS, 'other-account@x.it', table), null)
  })

  it('never reads admin out of a stored row, even if one somehow held that text', () => {
    const table = [{ accountOwnerEmail: ACCOUNT, email: 'x@x.it', role: 'admin' as never }]
    assert.equal(roleOf('x@x.it', OWNERS, ACCOUNT, table), 'viewer')
  })

  it('is null for someone on neither side', () => {
    assert.equal(roleOf('nessuno@x.it', OWNERS, ACCOUNT, [at('v@x.it', 'viewer')]), null)
    assert.equal(roleOf('nessuno@x.it', OWNERS, ACCOUNT, []), null)
    assert.equal(roleOf(null, OWNERS, ACCOUNT, []), null)
    assert.equal(roleOf('', OWNERS, ACCOUNT, []), null)
  })

  it('admits only the owners when the table did not answer', () => {
    assert.equal(roleOf('padrone@x.it', OWNERS, ACCOUNT, null), 'admin')
    assert.equal(roleOf(ACCOUNT, OWNERS, ACCOUNT, null), 'admin', 'the account’s own owner needs no row')
    assert.equal(roleOf('e@x.it', OWNERS, ACCOUNT, null), null)
  })

  it('refuses everyone when nothing is configured', () => {
    assert.equal(roleOf('padrone@x.it', undefined, ACCOUNT, null), null)
    assert.equal(roleOf('padrone@x.it', '', ACCOUNT, []), null)
  })

  it('reads a role the database should not hold as the least of them', () => {
    const table = [{ accountOwnerEmail: ACCOUNT, email: 'x@x.it', role: 'superuser' as never }]
    assert.equal(roleOf('x@x.it', OWNERS, ACCOUNT, table), 'viewer')
  })
})

describe('isAdmitted', () => {
  it('admits a global owner unconditionally', () => {
    assert.equal(isAdmitted('padrone@x.it', OWNERS, null), true)
    assert.equal(isAdmitted('PADRONE@X.IT', OWNERS, []), true)
  })

  it('admits anyone with a row on any account, not just the one they will open first', () => {
    assert.equal(isAdmitted('e@x.it', OWNERS, [at('e@x.it', 'editor')]), true)
  })

  it('refuses whoever is on neither side', () => {
    assert.equal(isAdmitted('nessuno@x.it', OWNERS, []), false)
    assert.equal(isAdmitted('nessuno@x.it', OWNERS, null), false)
    assert.equal(isAdmitted(null, OWNERS, []), false)
  })
})

describe('readRole', () => {
  it('keeps the two a member row may actually hold', () => {
    for (const role of MEMBER_ROLES) assert.equal(readRole(role), role)
  })

  it('falls back to viewer for anything else, admin included', () => {
    assert.equal(readRole(null), 'viewer')
    assert.equal(readRole(undefined), 'viewer')
    assert.equal(readRole(''), 'viewer')
    assert.equal(readRole('admin'), 'viewer', 'admin is never read out of a stored row')
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
    assert.equal(canEdit('editor') && !canManageUsers('editor'), true)
  })
})
