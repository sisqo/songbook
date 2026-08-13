'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { InstrumentPicker } from '@/components/InstrumentPicker'
import { useRole } from '@/components/RoleProvider'
import { ThemePicker } from '@/components/ThemePicker'
import {
  IconBroadcast,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconExternal,
  IconKey,
  IconMenu,
  IconNote,
  IconSettings,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import type { Section } from '@/components/TopBar'
import {
  type BroadcastState,
  getMyBroadcast,
  startBroadcast,
  stopBroadcast,
} from '@/lib/singAlong/session'

/**
 * The link a guest's device opens to follow this reader's broadcast.
 *
 * A plain function rather than a constant: `window` does not exist while this module's
 * top level runs on the server, and a function's body is not evaluated until something
 * calls it. Every call site — the QR effect, `copyLink`, and the JSX branch below — is
 * reachable only once `broadcast` holds an actual token, and that never happens before
 * the effect that first calls `getMyBroadcast` returns. On the server `broadcast` is
 * still its initial `undefined`, so none of them run before this component is safely on
 * the client.
 */
function followUrl(token: string): string {
  return `${window.location.origin}/follow/${token}`
}

/** The tuner, which is a separate app on its own domain. */
const TUNER_URL = 'https://guitar.sisqo.dev'

/**
 * The header's sections, behind one button.
 *
 * A menu rather than a row of links because the header is now on every screen,
 * including the reading page where horizontal space belongs to the song. Inside
 * the panel every entry carries its label, which the icon-only row on a phone
 * could not.
 *
 * Sign-out arrives as `children`: it is a server component wrapping a server
 * action, and passing it in is what lets this component be interactive without
 * turning that action into a client-side call.
 *
 * One entry depends on what the reader may do, and it is absent until the answer
 * arrives rather than present and refusing. A viewer's menu is therefore the songs,
 * the tuner, singing together, and how they like to read — which is everything a
 * viewer has.
 *
 * Settings is a second screen inside the same panel rather than a page of its own:
 * changing the theme or the instrument is something a reader does mid-song, and a
 * real navigation would cost them the page they were reading to get there and again
 * to get back. `view` resets to `main` on every close, so the panel always opens
 * where it left off closing — at the top, not wherever Settings happened to leave it.
 *
 * Sing Together is a second screen for the same reason, and lives beside Settings
 * rather than inside it: it is reached mid-song too, but what it does is about the
 * repertoire being read, not about this reader's own account, which is what the
 * comment on Settings' own row below says that group is for. Whether a broadcast is
 * already running is asked once, on mount, and kept in this component rather than in
 * `view` — `view` is reset by every close, and a broadcast the reader already started
 * is exactly the thing that must not be forgotten the next time they open this panel.
 */
export function NavMenu({
  current,
  children,
}: {
  current: Section
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'settings' | 'sing-together'>('main')
  const { mayManageUsers } = useRole()

  /*
   * `undefined` until the read comes back, `null` once it has and there is nothing
   * running, and the row itself once there is. Kept here rather than inside the view
   * below so it survives the view resetting to `main` on every close — asked once, for
   * as long as this menu exists, so reopening the panel later shows the same QR and
   * link rather than a blank "no broadcast" that has to be told otherwise again.
   */
  const [broadcast, setBroadcast] = useState<BroadcastState | null | undefined>(undefined)
  /*
   * Separate from `broadcast` itself: `broadcast === null` has to keep meaning two
   * different things apart, not collapse them into one. A reader who really has
   * nothing running may safely be offered Start. A reader whose broadcast could simply
   * not be asked about — offline, or a request that failed in transit — must not be,
   * because `startBroadcast` restarts rather than refuses (see its own doc comment):
   * offering Start there risks quietly rotating the token under a link already handed
   * out, the moment the connection comes back and the tap lands. Cleared only by a
   * check that actually got an answer, not by time or by a later render.
   */
  const [askFailed, setAskFailed] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const checkBroadcast = () => {
    setAskFailed(false)
    void getMyBroadcast()
      .then(setBroadcast)
      .catch(() => {
        setAskFailed(true)
        setBroadcast(null)
      })
  }

  useEffect(() => {
    checkBroadcast()
  }, [])

  /*
   * The QR is redrawn only when the token actually changes — starting a broadcast, or
   * restarting one — not on every render, and not for the semitones or song a broadcast
   * is showing, which the QR has nothing to say about: the link is the same link
   * whatever it currently points a guest's screen at.
   *
   * `token` is hoisted out of the dependency array rather than written as
   * `broadcast?.token` inline: the same optional chain the effect body would otherwise
   * repeat, computed once, so there is one expression to read instead of two that have
   * to be trusted to agree.
   */
  const token = broadcast?.token
  useEffect(() => {
    if (token === undefined) {
      setQr(null)
      return
    }

    let cancelled = false
    QRCode.toDataURL(followUrl(token))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const close = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (view !== 'main') setView('main')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view])

  const startSinging = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await startBroadcast()
      if (result.ok) setBroadcast({ token: result.token, songSlug: null, semitones: 0 })
      else setError("Couldn't start. Try again.")
    } catch {
      setError("Couldn't start. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const stopSinging = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await stopBroadcast()
      if (result.ok) setBroadcast(null)
      else setError("Couldn't stop. Try again.")
    } catch {
      setError("Couldn't stop. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (broadcast == null) return
    try {
      await navigator.clipboard.writeText(followUrl(broadcast.token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard access can be refused; the link is still there as selectable text. */
    }
  }

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => {
          setOpen((value) => !value)
          setView('main')
        }}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel" role="menu">
            {view === 'settings' && (
              <>
                {/*
                  * Its own row rather than a header: on a phone this is still a tap
                  * target. The label reads "Settings" either way, so the accessible
                  * name says what the tap actually does — a screen reader has no
                  * chevron to tell this apart from the row that opens this view.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Settings
                </button>

                <div className="menu-divider" />

                {/*
                  * Every role has one of these: how you get in is your own business, and
                  * a viewer needs it as much as an admin.
                  */}
                <Link href="/password" className={item('password')} role="menuitem" onClick={close}>
                  <IconKey size={17} />
                  Password
                </Link>

                {/*
                  * Neither is a destination, so neither closes the menu: the reader is
                  * looking at the thing they are changing, and the panel is part of it.
                  */}
                <InstrumentPicker />
                <ThemePicker />
              </>
            )}

            {view === 'sing-together' && (
              <>
                {/*
                  * Same back-row pattern as Settings, word for word: the accessible name
                  * says what the tap does rather than what the row is called, since a
                  * screen reader has no chevron to tell this row apart from the one that
                  * opened this view.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Sing together
                </button>

                <div className="menu-divider" />

                <div className="px-1.5 pb-1 pt-1">
                  {/* Not yet known whether this reader already has one running. */}
                  {broadcast === undefined && <p className="text-sm text-muted">One moment…</p>}

                  {broadcast === null && askFailed && (
                    /*
                     * Not the Start button: asking whether one is already running is
                     * what failed, and Start would answer a different question. Offering
                     * it here risks a reader with a broadcast already live and shared
                     * rotating its token by accident the moment a retry would have shown
                     * it was still there.
                     */
                    <>
                      <p className="notice notice-error" role="alert">
                        Couldn&apos;t check whether you already have one running.
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm mt-3 w-full"
                        onClick={checkBroadcast}
                      >
                        Try again
                      </button>
                    </>
                  )}

                  {broadcast === null && !askFailed && (
                    <>
                      <p className="text-sm text-muted">
                        Share a link. Whoever opens it follows the song and the key you&apos;re
                        reading it in, live — no account needed on their side.
                      </p>

                      {error !== null && (
                        <p className="notice notice-error mt-3" role="alert">
                          {error}
                        </p>
                      )}

                      <button
                        type="button"
                        className="btn btn-primary mt-3 w-full"
                        onClick={() => void startSinging()}
                        disabled={busy}
                      >
                        <IconBroadcast size={16} />
                        Start broadcasting
                      </button>
                    </>
                  )}

                  {broadcast !== null && broadcast !== undefined && (
                    <>
                      {/*
                        * A data URL, not a file the browser fetches — `next/image` optimizes
                        * requests to a source, and there is no source here but the string
                        * already in memory. A plain `<img>` is the whole of what this needs.
                        */}
                      {qr !== null ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL held in memory, not a fetched image `next/image` could optimize
                        <img
                          src={qr}
                          alt="QR code for the link that follows this broadcast"
                          className="mx-auto block h-auto w-36 rounded-[var(--r-md)]"
                        />
                      ) : (
                        <div
                          className="mx-auto h-36 w-36 rounded-[var(--r-md)] bg-[var(--surface-2)]"
                          aria-hidden
                        />
                      )}

                      {/*
                        * Selectable rather than only copyable: the button beside it can be
                        * refused by the browser, but a long-press on plain text cannot.
                        */}
                      <p className="mt-3 select-all break-all text-center text-xs text-muted">
                        {followUrl(broadcast.token)}
                      </p>

                      {error !== null && (
                        <p className="notice notice-error mt-3" role="alert">
                          {error}
                        </p>
                      )}

                      <button
                        type="button"
                        className="btn btn-sm mt-3 w-full"
                        onClick={() => void copyLink()}
                      >
                        {copied ? <IconCheck size={14} /> : null}
                        {copied ? 'Copied' : 'Copy link'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger mt-2 w-full"
                        onClick={() => void stopSinging()}
                        disabled={busy}
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {view === 'main' && (
              <>
                <Link href="/" className={item('songs')} role="menuitem" onClick={close}>
                  <IconNote size={17} />
                  Home
                </Link>

                {mayManageUsers && (
                  <Link href="/users" className={item('users')} role="menuitem" onClick={close}>
                    <IconUsers size={17} />
                    Users
                  </Link>
                )}

                {/*
                  * The tuner, which is another app on another domain.
                  *
                  * It sits with the sections rather than in a group of its own: from
                  * here it is one more place to go, and a fourth divider would make the
                  * menu look like four unrelated things. The arrow at the end is what
                  * says it leaves — and, by saying that, that it needs a network, which
                  * nothing else in this menu does.
                  *
                  * A plain anchor, in a new tab: the reader is in the middle of a song,
                  * and tuning should not cost them the page they were reading.
                  */}
                <a
                  href={TUNER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="menu-item"
                  role="menuitem"
                  onClick={close}
                >
                  <IconTuningFork size={17} />
                  Tuner
                  <span className="sr-only">(opens in a new tab)</span>
                  <IconExternal size={13} className="ms-auto" />
                </a>

                {/*
                  * Unconditional, like Home: any signed-in reader may start one, not only
                  * an editor or an admin — reading a repertoire together is not editing it.
                  * It sits with Home, Users and the tuner rather than behind the Settings
                  * divider below, because Settings is framed by its own comment down there
                  * as touching only this reader's own account, and this is very much about
                  * the repertoire — the songs this reader is about to sing from, sent to
                  * whoever opened the link. It still opens a second screen rather than
                  * navigating away, for the same reason Settings does: this is reached
                  * mid-song, and a real navigation would cost the reader the page they
                  * were reading to get here.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Sing together, opens the broadcast screen"
                  onClick={() => setView('sing-together')}
                >
                  <IconBroadcast size={17} />
                  Sing together
                  <IconChevronRight size={15} className="ms-auto" />
                </button>

                <div className="menu-divider" />

                {/*
                  * A second screen rather than a destination, so it does not close the
                  * panel — the chevron says as much, the same way the tuner's arrow says
                  * the opposite. Last before sign-out and behind its own divider: nothing
                  * here touches the repertoire, only this reader's own account and screen.
                  */}
                <button
                  type="button"
                  className={current === 'password' ? 'menu-item is-on w-full' : 'menu-item w-full'}
                  role="menuitem"
                  aria-label="Settings, opens the settings list"
                  onClick={() => setView('settings')}
                >
                  <IconSettings size={17} />
                  Settings
                  <IconChevronRight size={15} className="ms-auto" />
                </button>

                <div className="menu-divider" />
                {children}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
