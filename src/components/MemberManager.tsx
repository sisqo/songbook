'use client'

import { useCallback, useEffect, useState } from 'react'

import { RoleNotice } from '@/components/RoleNotice'
import { useRole } from '@/components/RoleProvider'
import { IconChevronDown, IconKey, IconOffline, IconPlus, IconTrash } from '@/components/icons'
import { removePasswordFor, setPasswordFor } from '@/lib/auth/actions'
import { MIN_PASSWORD, PASSWORD_MESSAGE, type PasswordResult } from '@/lib/auth/types'
import { addMember, loadMembers, removeMember, setMemberRole } from '@/lib/members/actions'
import { MEMBER_MESSAGE, type MemberList, type MemberResult } from '@/lib/members/types'
import { ROLES, type Role } from '@/lib/roles'
import { useOnline } from '@/lib/useOnline'

/** What each role is called on screen, and what it means in one line. */
const ROLE_NAME: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

const ROLE_HINT: Record<Role, string> = {
  admin: 'everything, including who can sign in',
  editor: 'edits the repertoire',
  viewer: 'read-only',
}

/**
 * Who may sign in, and with which role.
 *
 * Nothing is baked into the page and nothing is cached. Both are deliberate — this list
 * is not part of the repertoire, it is the answer to a question only the server can
 * answer, and a stale copy of it would say someone still has access when they do not. So
 * offline this screen says it cannot tell, which is the truth.
 *
 * The role is checked before the list is even asked for. Otherwise a non-admin who
 * reached this address would be told "could not read the list", which is
 * the wrong sentence: the question could have been asked, it simply was not theirs to ask.
 */
export function MemberManager() {
  const online = useOnline()
  const { known, mayManageUsers } = useRole()

  const [list, setList] = useState<MemberList | null>(null)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [invited, setInvited] = useState('')
  const [invitedRole, setInvitedRole] = useState<Role>('viewer')
  const [removing, setRemoving] = useState<string | null>(null)
  /** Whose password is being set, and to what. One at a time, like the removals. */
  const [pairing, setPairing] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  const refresh = useCallback(async () => {
    try {
      setList(await loadMembers())
    } catch {
      // Offline or signed out: the screen says it cannot tell.
      setList(null)
    } finally {
      setAsked(true)
    }
  }, [])

  useEffect(() => {
    if (mayManageUsers) void refresh()
  }, [refresh, mayManageUsers])

  const run = async (action: () => Promise<MemberResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (result.ok) await refresh()
      else setError(MEMBER_MESSAGE[result.reason])
      return result.ok
    } catch {
      setError(MEMBER_MESSAGE.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  /** The same, for the actions that answer with a password failure instead of a member one. */
  const runPassword = async (action: () => Promise<PasswordResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (result.ok) await refresh()
      else setError(PASSWORD_MESSAGE[result.reason])
      return result.ok
    } catch {
      setError(PASSWORD_MESSAGE.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!known) return null
  if (!mayManageUsers) {
    return <RoleNotice needed="Admin" what="see and change who can sign in" />
  }

  if (!asked) {
    return <p className="text-sm text-muted">One moment…</p>
  }

  if (list === null) {
    return (
      <p className="notice notice-accent">
        <IconOffline />
        {online
          ? 'Could not read who can sign in. Reload the page.'
          : 'You need a connection to see and change who can sign in.'}
      </p>
    )
  }

  const hasPassword = (email: string) => list.passwords.includes(email)

  const closePassword = () => {
    setPairing(null)
    setPassword('')
  }

  /**
   * The key beside a row, for the two addresses an admin may give a password to: an invited
   * member, or themselves. Another owner's is refused by the server, so it is not offered
   * here — their access answers to the environment and their identity to Google.
   */
  const keyButton = (email: string) => (
    <button
      type="button"
      className="icon-button"
      disabled={!online || busy}
      onClick={() => {
        setPairing(pairing === email ? null : email)
        setPassword('')
        setError(null)
      }}
      aria-label={hasPassword(email) ? `Change the password for ${email}` : `Give ${email} a password`}
      aria-expanded={pairing === email}
    >
      <IconKey size={17} />
    </button>
  )

  const passwordPanel = (email: string) =>
    pairing !== email ? null : (
      <div className="panel mt-3 p-3.5 text-sm">
        <p>
          {hasPassword(email)
            ? 'Replace the password for this address?'
            : 'Give this address a password?'}{' '}
          It lets them sign in without Google, which still works too.
        </p>

        <label className="mt-3 block max-w-sm">
          <span className="field-label">New password — at least {MIN_PASSWORD} characters</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="form-field"
            minLength={MIN_PASSWORD}
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || password.length < MIN_PASSWORD}
            onClick={async () => {
              if (await runPassword(() => setPasswordFor(email, password))) closePassword()
            }}
          >
            Save password
          </button>

          {hasPassword(email) && (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={async () => {
                if (await runPassword(() => removePasswordFor(email))) closePassword()
              }}
            >
              Remove password
            </button>
          )}

          <button type="button" className="btn btn-quiet btn-sm" onClick={closePassword}>
            Cancel
          </button>
        </div>
      </div>
    )

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2 className="section-title">Owners</h2>
        <p className="mb-2.5 text-sm leading-[1.45] text-muted">
          They come from the server configuration and can&apos;t be removed from here, so they are
          <strong> Admin</strong> by definition: it&apos;s the same thing that makes it impossible
          to lock yourself out of your own application.
        </p>

        <ul className="row-list card">
          {list.owners.map((email) => (
            <li key={email}>
              <div className="row">
                <span className="min-w-0 flex-1 truncate">{email}</span>
                {email === list.you && <span className="meta-chip">you</span>}
                <span className="meta-chip">{hasPassword(email) ? 'password' : 'Google'}</span>
                <span className="meta-chip">Admin</span>
                {/* Your own, and no one else's: see `keyButton`. */}
                {email === list.you && keyButton(email)}
              </div>
              {passwordPanel(email)}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="section-title">Invited</h2>
        <p className="mb-2.5 text-sm leading-[1.45] text-muted">
          They sign in with their Google account, or with a password you give them here, and
          with the role you choose. Every change takes effect from their next action: they don&apos;t
          need to sign out and back in.
        </p>

        <ul className="mb-3.5 grid gap-1 text-sm text-muted">
          {ROLES.map((role) => (
            <li key={role}>
              <strong>{ROLE_NAME[role]}</strong> — {ROLE_HINT[role]}
            </li>
          ))}
        </ul>

        {list.members.length === 0 ? (
          <p className="panel p-3.5 text-sm text-muted">
            No one yet. Only owners can sign in.
          </p>
        ) : (
          <ul className="card-stack">
            {list.members.map((member) => {
              const isRemoving = removing === member.email
              const isYou = member.email === list.you
              /*
               * A row whose address has since been put in `ALLOWED_EMAILS`. It grants
               * nothing — the environment already made them admin — so its role is not
               * offered, and it is said out loud rather than left looking like a second
               * account. Removing it is allowed, and is the tidy thing to do.
               */
              const overridden = list.owners.includes(member.email)

              return (
                <li key={member.email} className="card p-[0.875rem] sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{member.email}</span>
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">
                        {member.addedBy === null ? 'added' : `added by ${member.addedBy}`} ·{' '}
                        {when(member.createdAt)}
                      </span>
                    </span>

                    {/*
                      * Your own role is shown rather than offered: demoting yourself out of
                      * the screen you are standing on, with one tap and no question, is not
                      * a gesture worth having. An owner can always put it back.
                      */}
                    <span className="meta-chip">
                      {hasPassword(member.email) ? 'password' : 'Google'}
                    </span>

                    {overridden ? (
                      <>
                        <span className="meta-chip">owner</span>
                        <button
                          type="button"
                          className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                          disabled={!online || busy}
                          onClick={() => {
                            setRemoving(isRemoving ? null : member.email)
                            setError(null)
                          }}
                          aria-label={`Remove the row for ${member.email}`}
                          aria-expanded={isRemoving}
                        >
                          <IconTrash size={17} />
                        </button>
                      </>
                    ) : isYou ? (
                      <>
                        <span className="meta-chip">you</span>
                        <span className="meta-chip">{ROLE_NAME[member.role]}</span>
                        {keyButton(member.email)}
                      </>
                    ) : (
                      <>
                        <label className="picker">
                          <span className="sr-only">Role of {member.email}</span>
                          <select
                            value={member.role}
                            disabled={!online || busy}
                            onChange={(event) =>
                              void run(() =>
                                setMemberRole(member.email, event.target.value as Role),
                              )
                            }
                            className="picker-select"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_NAME[role]}
                              </option>
                            ))}
                          </select>
                          <IconChevronDown size={14} />
                        </label>

                        {keyButton(member.email)}

                        <button
                          type="button"
                          className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                          disabled={!online || busy}
                          onClick={() => {
                            setRemoving(isRemoving ? null : member.email)
                            setError(null)
                          }}
                          aria-label={`Remove ${member.email}`}
                          aria-expanded={isRemoving}
                        >
                          <IconTrash size={17} />
                        </button>
                      </>
                    )}
                  </div>

                  {passwordPanel(member.email)}

                  {/*
                    * What removal actually does, said where it is about to be done.
                    *
                    * A cookie lasts ninety days and the songs are precached, so this is
                    * not a door slamming: it stops them changing anything shared, now,
                    * and their own copy stays theirs until they sign in again. Saying so
                    * here is what keeps the button from promising more than it does.
                    */}
                  {isRemoving && (
                    <div className="panel mt-3.5 p-3.5 text-sm">
                      <p>
                        {overridden ? (
                          <>
                            This address is among the owners, so this row doesn&apos;t grant it
                            anything: removing it doesn&apos;t change their access, and it only
                            takes it away the day they leave the server configuration.
                          </>
                        ) : (
                          <>
                            Remove <span className="whitespace-nowrap">{member.email}</span>? From
                            now on they won&apos;t be able to change anything. The session they
                            already have stays valid until their next sign-in, and the pages
                            they&apos;ve downloaded stay on their device.
                          </>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busy}
                          onClick={async () => {
                            if (await run(() => removeMember(member.email))) setRemoving(null)
                          }}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => setRemoving(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await run(() => addMember(invited, invitedRole))) {
              setInvited('')
              setInvitedRole('viewer')
            }
          }}
        >
          {/*
            * Full width on a phone, where the address, the role and the button cannot
            * share a line: two deliberate rows read better than a button left over on the
            * second one. From `sm` up all three fit, so they sit together again.
            */}
          <label className="basis-full sm:basis-auto sm:flex-1">
            <span className="sr-only">Address to admit</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={invited}
              onChange={(event) => setInvited(event.target.value)}
              placeholder="name@example.com"
              className="form-field min-h-12 rounded-pill px-[1.125rem]"
            />
          </label>

          {/* Viewer to begin with: the least a new arrival could need, raised on purpose. */}
          <label className="picker picker-raised">
            <span className="sr-only">Role of the new user</span>
            <select
              value={invitedRole}
              onChange={(event) => setInvitedRole(event.target.value as Role)}
              className="picker-select"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_NAME[role]}
                </option>
              ))}
            </select>
            <IconChevronDown size={14} />
          </label>

          <button
            type="submit"
            className="btn btn-primary min-h-12 px-5"
            disabled={!online || busy || invited.trim() === ''}
          >
            <IconPlus size={16} />
            Admit
          </button>
        </form>

        {!online && (
          <p className="notice notice-accent mt-4">
            <IconOffline />
            Without a connection the list can only be read.
          </p>
        )}
      </section>
    </div>
  )
}

/** The day, short: the hour of an invitation has never mattered to anyone. */
function when(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
