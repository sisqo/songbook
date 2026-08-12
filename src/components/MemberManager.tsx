'use client'

import { useCallback, useEffect, useState } from 'react'

import { RoleNotice } from '@/components/RoleNotice'
import { useRole } from '@/components/RoleProvider'
import { IconChevronDown, IconOffline, IconPlus, IconTrash } from '@/components/icons'
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
  admin: 'tutto, compreso chi entra',
  editor: 'modifica il repertorio',
  viewer: 'solo lettura',
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
 * reached this address would be told "non è stato possibile leggere l'elenco", which is
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

  if (!known) return null
  if (!mayManageUsers) {
    return <RoleNotice needed="Admin" what="vedere e cambiare chi può entrare" />
  }

  if (!asked) {
    return <p className="text-sm text-muted">Un momento…</p>
  }

  if (list === null) {
    return (
      <p className="notice notice-accent">
        <IconOffline />
        {online
          ? 'Non è stato possibile leggere chi può entrare. Ricarica la pagina.'
          : 'Serve la rete per vedere e cambiare chi può entrare.'}
      </p>
    )
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2 className="section-title">Proprietari</h2>
        <p className="mb-2.5 text-sm leading-[1.45] text-muted">
          Vengono dalla configurazione del server e non si rimuovono da qui, quindi sono
          <strong> Admin</strong> per definizione: è la stessa cosa che rende impossibile
          chiudersi fuori dalla propria applicazione.
        </p>

        <ul className="row-list card">
          {list.owners.map((email) => (
            <li key={email}>
              <div className="row">
                <span className="min-w-0 flex-1 truncate">{email}</span>
                {email === list.you && <span className="meta-chip">tu</span>}
                <span className="meta-chip">Admin</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="section-title">Invitati</h2>
        <p className="mb-2.5 text-sm leading-[1.45] text-muted">
          Entrano come i proprietari, con il loro account Google, e con il ruolo che dai loro
          qui. Ogni cambio vale dalla loro azione successiva: non serve che escano e rientrino.
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
            Nessuno, per ora. Solo i proprietari possono entrare.
          </p>
        ) : (
          <ul className="card-stack">
            {list.members.map((member) => {
              const isRemoving = removing === member.email
              const isYou = member.email === list.you

              return (
                <li key={member.email} className="card p-[0.875rem] sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{member.email}</span>
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">
                        {member.addedBy === null ? 'aggiunto' : `aggiunto da ${member.addedBy}`} ·{' '}
                        {when(member.createdAt)}
                      </span>
                    </span>

                    {/*
                      * Your own role is shown rather than offered: demoting yourself out of
                      * the screen you are standing on, with one tap and no question, is not
                      * a gesture worth having. An owner can always put it back.
                      */}
                    {isYou ? (
                      <>
                        <span className="meta-chip">tu</span>
                        <span className="meta-chip">{ROLE_NAME[member.role]}</span>
                      </>
                    ) : (
                      <>
                        <label className="picker">
                          <span className="sr-only">Ruolo di {member.email}</span>
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

                        <button
                          type="button"
                          className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                          disabled={!online || busy}
                          onClick={() => {
                            setRemoving(isRemoving ? null : member.email)
                            setError(null)
                          }}
                          aria-label={`Rimuovi ${member.email}`}
                          aria-expanded={isRemoving}
                        >
                          <IconTrash size={17} />
                        </button>
                      </>
                    )}
                  </div>

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
                        Rimuovere <span className="whitespace-nowrap">{member.email}</span>? Da
                        subito non potrà più cambiare niente. La sessione che ha già aperto resta
                        valida fino al prossimo ingresso, e le pagine che ha scaricato restano sul
                        suo dispositivo.
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
                          Rimuovi
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => setRemoving(null)}
                        >
                          Annulla
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
            <span className="sr-only">Indirizzo da ammettere</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={invited}
              onChange={(event) => setInvited(event.target.value)}
              placeholder="nome@example.com"
              className="form-field min-h-12 rounded-pill px-[1.125rem]"
            />
          </label>

          {/* Viewer to begin with: the least a new arrival could need, raised on purpose. */}
          <label className="picker picker-raised">
            <span className="sr-only">Ruolo del nuovo utente</span>
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
            Ammetti
          </button>
        </form>

        {!online && (
          <p className="notice notice-accent mt-4">
            <IconOffline />
            Senza connessione l&apos;elenco si può solo leggere.
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
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}
