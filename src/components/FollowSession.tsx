'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { ControlBar } from '@/components/ControlBar'
import { PrefsProvider, usePrefs } from '@/components/PrefsProvider'
import { SongSheet } from '@/components/SongSheet'
import { IconBroadcast, IconChevronDown, IconChevronLeft, IconChevronRight } from '@/components/icons'
import { chordTokens, parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data/types'
import {
  type GuestSongbook,
  type GuestSongbookContent,
  guestListSongbooks,
  guestListSongs,
  guestLoadSong,
} from '@/lib/singAlong/guestReads'
import { pollBroadcast } from '@/lib/singAlong/session'

/** How often a guest's device asks what the broadcast is showing now. */
const POLL_MS = 4000

/**
 * One songbook's songs, plus which of its sections this guest has opened.
 *
 * Bundled together rather than two separate pieces of state so that opening a
 * *different* songbook always starts folded the same way `SongbookSongs` does for a
 * songbook nobody has looked at yet: swapping this whole object for a new one throws
 * the old fold state away for free, instead of it lingering keyed by section ids that
 * happen not to collide with the new songbook's.
 */
interface OpenSongbook {
  slug: string
  content: GuestSongbookContent
  open: Record<number, boolean>
}

/**
 * The song on screen, and why it is there.
 *
 * A guest's own tap and the broadcaster's play are not the same kind of "showing a
 * song", and the difference is not cosmetic: only a followed song is locked to a key
 * it did not choose, and only a followed song carries that key here at all. A song the
 * guest picked keeps whatever key their own `PrefsProvider` last had for it — there is
 * no broadcast semitones value to disagree with it.
 */
type ShownSong = { data: Song; following: false } | { data: Song; following: true; semitones: number }

type Screen = 'loading' | 'ended' | 'songbooks' | 'songbook' | 'song'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSectionOpen(songbook: OpenSongbook, sectionId: number): boolean {
  // Closed unless the guest opened it, or it is the only section there is — the same
  // two defaults `SongbookSongs` uses, minus the "arrived from a song" exception, which
  // needs a URL fragment this screen has no equivalent of.
  return songbook.open[sectionId] ?? songbook.content.sections.length === 1
}

/**
 * The whole guest side of Sing Together: everything that opens when someone with no
 * account follows a broadcaster's link.
 *
 * Three things a guest can be looking at, and the broadcast can end any of them without
 * asking:
 *
 * 1. **Browsing** — the songbooks, then one songbook's songs, read exactly like a
 *    signed-in visitor would, through `guestListSongbooks`/`guestListSongs`/
 *    `guestLoadSong` instead of the mutable layer a session would unlock.
 * 2. **Following** — the broadcaster played something, so this screen is showing it, at
 *    the broadcaster's key, whether or not that is what this guest was doing a moment
 *    ago. There is deliberately no way to back out of this from here: the one way out
 *    is the broadcast itself moving on, or ending.
 * 3. **Ended** — the token no longer answers to a live broadcast, whether because it
 *    expired, was replaced by a fresh one, or never was one. Every guest action reports
 *    this the same way (`null`), so this screen reacts to it the same way everywhere:
 *    stop, and say so plainly.
 *
 * What ties 1 and 2 together is a poll every few seconds, compared against *what is
 * currently on screen* rather than against whatever the previous poll said — see the
 * comment on the effect below for why that is the one comparison that gets both "the
 * broadcast already had something playing before I opened this link" and "a guest who
 * happens to be reading the very song being broadcast, on their own, right" without
 * writing either case down as a rule of its own.
 */
export function FollowSession({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [songbooks, setSongbooks] = useState<GuestSongbook[]>([])
  const [songbook, setSongbook] = useState<OpenSongbook | null>(null)
  const [song, setSong] = useState<ShownSong | null>(null)

  /*
   * What the poll loop below reads to decide whether the broadcast disagrees with the
   * screen. It has to be a ref: the loop is one closure started once, in the effect
   * below, and by the time a poll several seconds later needs to ask "what is showing
   * right now", a tap may have changed `screen`/`song` since the closure was made. A
   * plain read of the state variables there would answer with whatever they were when
   * the effect ran, not with whatever is actually on screen.
   */
  const shownRef = useRef<{ screen: Screen; song: ShownSong | null }>({ screen: 'loading', song: null })
  useEffect(() => {
    shownRef.current = { screen, song }
  }, [screen, song])

  /**
   * Sidesteps setting state on a component that is no longer here — used only by the
   * tap handlers below, whose awaited reads can outlive a guest navigating away mid
   * flight. The poll loop keeps its own flag instead of this one; see its own comment
   * for why the two must not be the same flag.
   */
  const goneRef = useRef(false)
  useEffect(() => {
    goneRef.current = false
    return () => {
      goneRef.current = true
    }
  }, [])

  useEffect(() => {
    /*
     * Local to this one run of the effect, deliberately not the ref above. In
     * development, StrictMode mounts this effect, tears it down, and mounts it again
     * before settling — and a flag shared with the tap handlers, reset to `false` every
     * time the effect body runs, would un-cancel the *first* run's loop the instant the
     * second run started, leaving two loops polling the same broadcast forever instead
     * of one. A variable closed over by this call alone cannot be reset by any other
     * call: only this run's cleanup ever sets it, and only this run's loop ever reads
     * it, so the first run's loop stays cancelled no matter how many more follow it.
     */
    let cancelled = false

    /** Reconciles one poll's answer against whatever is currently on screen. */
    async function reconcile(songSlug: string | null, semitones: number): Promise<void> {
      // Nothing playing yet — the broadcast has opened but nobody has pressed play, or
      // (per this token's own rules) never will again under this token. Either way,
      // there is nothing here to force the guest onto, so leave them to browse.
      if (songSlug === null) return

      const shown = shownRef.current
      const displayedSlug = shown.screen === 'song' && shown.song !== null ? shown.song.data.slug : null

      if (songSlug !== displayedSlug) {
        /*
         * Different from what is on screen — including "nothing", which is what a
         * guest browsing the songbooks or a songbook's songs is showing, and including
         * the very first poll this loop ever makes, if the broadcast already had a
         * song going before this guest opened the link at all. Either way the answer is
         * the same: fetch it and switch into following mode, overwriting whatever the
         * guest was doing. The broadcaster's play always wins; there is no "don't
         * interrupt me" on this side of the link.
         */
        const loaded = await guestLoadSong(token, songSlug)
        if (cancelled) return

        if (loaded === null) {
          setScreen('ended')
          return
        }

        setSong({ data: loaded, following: true, semitones })
        setScreen('song')
        return
      }

      /*
       * The same song is already on screen. If that is because this guest is following
       * it, the key may still have moved — push it along, with no re-fetch, since the
       * song's own words have not changed.
       *
       * If instead it is on screen because the guest happened to browse to the very
       * song the broadcast is playing, on their own, this branch does nothing: nothing
       * above just made that switch, and nothing here promotes a coincidence into
       * following mode. That guest keeps reading it their own way, unlocked, until the
       * broadcast actually changes to something else — the one event that does.
       */
      if (shown.song !== null && shown.song.following && shown.song.semitones !== semitones) {
        setSong({ data: shown.song.data, following: true, semitones })
      }
    }

    async function run(): Promise<void> {
      let list: GuestSongbook[]
      try {
        const result = await guestListSongbooks(token)
        if (cancelled) return

        if (result === null) {
          setScreen('ended')
          return
        }
        list = result
      } catch {
        // A dropped request is not the same answer as an expired token — it is not an
        // answer at all. Nothing else in this app retries a failed read on its own, so
        // this does not either: it leaves the loading state up rather than telling a
        // guest with a flaky connection that the link is over.
        return
      }

      setSongbooks(list)
      setScreen('songbooks')

      // Polling starts right away, not after the first four-second wait: a broadcast
      // that already had a song going before this link was opened should not leave its
      // guest looking at the songbook list for a beat first.
      while (!cancelled) {
        let poll
        try {
          poll = await pollBroadcast(token)
        } catch {
          // Same reasoning as above: try again next tick rather than call it expired.
          await sleep(POLL_MS)
          continue
        }
        if (cancelled) return

        if (!poll.ok) {
          setScreen('ended')
          return
        }

        await reconcile(poll.songSlug, poll.semitones)
        if (cancelled) return

        await sleep(POLL_MS)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [token])

  async function openSongbook(slug: string): Promise<void> {
    const content = await guestListSongs(token, slug)
    if (goneRef.current) return

    if (content === null) {
      setScreen('ended')
      return
    }

    setSongbook({ slug, content, open: {} })
    setScreen('songbook')
  }

  async function openSong(slug: string): Promise<void> {
    const loaded = await guestLoadSong(token, slug)
    if (goneRef.current) return

    if (loaded === null) {
      setScreen('ended')
      return
    }

    setSong({ data: loaded, following: false })
    setScreen('song')
  }

  function toggleSection(sectionId: number): void {
    if (songbook === null) return
    setSongbook({ ...songbook, open: { ...songbook.open, [sectionId]: !isSectionOpen(songbook, sectionId) } })
  }

  if (screen === 'loading') {
    return <p className="mt-8 text-center text-sm text-muted">Loading…</p>
  }

  if (screen === 'ended') {
    return (
      <p className="mt-8 text-center text-sm text-muted">
        This link has ended. Ask whoever shared it for a new one.
      </p>
    )
  }

  if (screen === 'song' && song !== null) {
    return (
      <FollowedSong
        song={song}
        backLabel={songbook?.content.songbookName ?? 'Songbook'}
        onBack={() => setScreen('songbook')}
      />
    )
  }

  if (screen === 'songbook' && songbook !== null) {
    const total = songbook.content.sections.reduce((count, section) => count + section.songs.length, 0)

    return (
      <div>
        <button type="button" className="back-link mb-4" onClick={() => setScreen('songbooks')}>
          <IconChevronLeft size={16} />
          <span>All songbooks</span>
        </button>

        <header className="mb-[1.125rem]">
          <h1 className="screen-title">{songbook.content.songbookName}</h1>
        </header>

        {total === 0 ? (
          <p className="panel p-3.5 text-sm text-muted">No songs in this songbook.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {total} {total === 1 ? 'song' : 'songs'}
              {songbook.content.sections.length > 1 && ` · ${songbook.content.sections.length} sections`}
            </p>

            <ul className="card-stack">
              {songbook.content.sections.map((section) => {
                const open = isSectionOpen(songbook, section.id)

                return (
                  <li key={section.id} className="card p-2">
                    <button
                      type="button"
                      className="row w-full text-left"
                      onClick={() => toggleSection(section.id)}
                      aria-expanded={open}
                    >
                      {open ? (
                        <IconChevronDown size={18} className="text-faint" />
                      ) : (
                        <IconChevronRight size={18} className="text-faint" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{section.name}</span>
                      <span className="count-badge">{section.songs.length}</span>
                    </button>

                    {open &&
                      (section.songs.length === 0 ? (
                        <p className="px-[0.875rem] pb-2 pt-1 text-sm text-muted">
                          No songs in this section.
                        </p>
                      ) : (
                        <ul>
                          {section.songs.map((entry) => (
                            <li key={entry.slug}>
                              <button
                                type="button"
                                className="row w-full text-left"
                                onClick={() => void openSong(entry.slug)}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{entry.title}</span>
                                  {entry.artist !== null && (
                                    <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                                      {entry.artist}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ))}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    )
  }

  // screen === 'songbooks'
  return (
    <div>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Sing Together</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          Browse the repertoire while you wait. The moment the broadcast plays a song,
          this screen switches to it, at the same key, on its own.
        </p>
      </header>

      {songbooks.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">No songbook yet.</p>
      ) : (
        <ul className="row-list card">
          {songbooks.map((entry) => (
            <li key={entry.slug}>
              <button
                type="button"
                className="row w-full text-left"
                onClick={() => void openSongbook(entry.slug)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                <span className="count-badge">{entry.count}</span>
                <IconChevronRight size={18} className="text-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One song, read either on the guest's own terms or on the broadcaster's.
 *
 * `key={song.data.slug}` on the provider is what makes switching songs safe to do by
 * surprise, mid broadcast: without it, following a new song would keep the previous
 * one's zoom, notation and capo on the new sheet, because `PrefsProvider` only re-reads
 * its local cache when its own `songSlug` prop changes identity-wise in a way React
 * notices — a fresh mount, forced by the key, is the reliable way to make that happen
 * every time, not just sometimes.
 *
 * There is no back link while `following`. Reaching it would set what is on screen back
 * to nothing (`displayedSlug === null` in the reconcile above), which the very next poll
 * — a few seconds later — would read as "different from what is on screen" and undo by
 * following the same song again. A control that visibly reverses itself is worse than
 * no control, so this screen does not offer it: the one way off a followed song is the
 * broadcast moving on, or ending.
 */
function FollowedSong({
  song,
  backLabel,
  onBack,
}: {
  song: ShownSong
  /** The songbook `onBack` leads to. Unused, and never shown, while following. */
  backLabel: string
  onBack: () => void
}) {
  const parsed = useMemo(() => parseChordPro(song.data.body), [song.data])

  return (
    <PrefsProvider songSlug={song.data.slug} persist={false} key={song.data.slug}>
      {song.following && <PushBroadcastKey semitones={song.semitones} />}

      {song.following ? (
        <p className="notice notice-accent mb-4">
          <IconBroadcast size={16} />
          Following the broadcast — the key changes with it, live.
        </p>
      ) : (
        <button type="button" className="back-link mb-4" onClick={onBack}>
          <IconChevronLeft size={16} />
          <span className="truncate">{backLabel}</span>
        </button>
      )}

      <header className="mb-4">
        <h1 className="text-[1.6875rem] font-medium leading-[1.12] tracking-[-0.03em]">
          {song.data.title}
        </h1>
        {song.data.artist !== null && <p className="mt-2.5 text-base text-muted">{song.data.artist}</p>}
      </header>

      <SongSheet song={parsed} />

      <div className="bar-spacer" />

      {/*
        * `broadcastEnabled={false}` keeps this bar's play/key controls purely local: this
        * screen must never call `broadcastPlay`/`broadcastTranspose`, whether or not the
        * browser showing the link happens to also be signed in somewhere else.
        * `semitonesLocked` is the other half, and about this screen specifically: while
        * following, it disables the key stepper so a guest cannot fight a value that
        * would only be pushed straight back by the next poll.
        */}
      <ControlBar
        songSlug={song.data.slug}
        chords={chordTokens(parsed)}
        semitonesLocked={song.following}
        broadcastEnabled={false}
      />
    </PrefsProvider>
  )
}

/**
 * The one bridge between a broadcast and this screen's own copy of the key.
 *
 * `PrefsProvider` has no idea a broadcast exists — it only ever holds whatever
 * `setSemitones` last told it. So the followed key has to be pushed in from outside,
 * which is what this does: once on mount, and again every time the poll's semitones
 * changes while this song stays followed.
 *
 * Mounted only inside a `persist={false}` provider (see `FollowedSong` above), so this
 * push stays in memory on this screen alone — it never reaches this guest's local cache,
 * and never queues a save to the database under whichever account, if any, happens to be
 * signed into the browser showing the link.
 */
function PushBroadcastKey({ semitones }: { semitones: number }) {
  const { setSemitones } = usePrefs()

  useEffect(() => {
    setSemitones(semitones)
  }, [semitones, setSemitones])

  return null
}
