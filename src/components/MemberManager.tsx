'use client'

import { useCallback, useEffect, useState } from 'react'

import { IconOffline, IconPlus, IconTrash } from '@/components/icons'
import { addMember, loadMembers, removeMember } from '@/lib/members/actions'
import { MEMBER_MESSAGE, type MemberList, type MemberResult } from '@/lib/members/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Who may sign in: add and remove.
 *
 * Nothing is baked into the page and nothing is cached. Both are deliberate — this
 * list is not part of the repertoire, it is the answer to a question only the server
 * can answer, and a stale copy of it would say someone still has access when they do
 * not. So offline this screen says it cannot tell, which is the truth.
 */
export function MemberManager() {
  const online = useOnline()

  const [list, setList] = useState<MemberList | null>(null)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [invited, setInvited] = useState('')
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
    void refresh()
  }, [refresh])

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
          Vengono dalla configurazione del server e non si rimuovono da qui: è questo che rende
          impossibile chiudersi fuori dalla propria applicazione.
        </p>

        <ul className="row-list card">
          {list.owners.map((email) => (
            <li key={email}>
              <div className="row">
                <span className="min-w-0 flex-1 truncate">{email}</span>
                {email === list.you && <span className="meta-chip">tu</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="section-title">Invitati</h2>
        <p className="mb-2.5 text-sm leading-[1.45] text-muted">
          Entrano come i proprietari, con il loro account Google. L&apos;accesso vale dal prossimo
          ingresso: non serve ricostruire il sito.
        </p>

        {list.members.length === 0 ? (
          <p className="panel p-3.5 text-sm text-muted">
            Nessuno, per ora. Solo i proprietari possono entrare.
          </p>
        ) : (
          <ul className="card-stack">
            {list.members.map((member) => {
              const isRemoving = removing === member.email

              return (
                <li key={member.email} className="card p-[0.875rem] sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{member.email}</span>
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">
                        {member.addedBy === null
                          ? 'aggiunto'
                          : `aggiunto da ${member.addedBy}`}{' '}
                        · {when(member.createdAt)}
                      </span>
                    </span>

                    {member.email === list.you ? (
                      <span className="meta-chip">tu</span>
                    ) : (
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
          className="mt-4 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await run(() => addMember(invited))) setInvited('')
          }}
        >
          <label className="flex-1">
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
