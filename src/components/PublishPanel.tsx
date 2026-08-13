'use client'

import { zipSync, strToU8 } from 'fflate'
import { useCallback, useEffect, useRef, useState } from 'react'

import { IconCheck, IconDownload, IconInfo, IconOffline, IconPublish, IconRebuild } from '@/components/icons'
import { useOnline } from '@/lib/useOnline'
import { exportAll, loadPending, publish } from '@/lib/import/actions'
import { PUBLISH_MESSAGE, type PendingSong } from '@/lib/import/types'

/**
 * The publish console: songs waiting to go live, the button that starts a rebuild, and
 * the export.
 *
 * None of this is about any one songbook — it lists what changed across the whole
 * repertoire and fires the site-wide deploy hook — so it asks nothing of
 * `useSongbooks()`. The only thing it needs from the platform is whether the browser
 * currently has a connection, and that comes from `useOnline()` alone.
 *
 * The caller decides who gets to see this at all. It used to live at the bottom of the
 * import screen, which already checked the role before rendering anything; now that it
 * sits on the home screen instead, `HomeScreen` makes the same check before mounting
 * this component, so there is no role gate duplicated in here.
 */
export function PublishPanel() {
  const online = useOnline()

  const [pending, setPending] = useState<PendingSong[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  /** Set when this screen goes away, so the watch below stops with it. */
  const gone = useRef(false)

  /** Null when the list could not be read, which is not the same as an empty one. */
  const refreshPending = useCallback(async (): Promise<PendingSong[] | null> => {
    try {
      const fresh = await loadPending()
      // Null is "could not ask" — offline, signed out, or no longer an editor — so the
      // list stays as it was. Only an answered, empty list means nothing is waiting.
      if (fresh !== null) setPending(fresh)
      return fresh
    } catch {
      // Offline or signed out: leave the list as it is.
      return null
    }
  }, [])

  useEffect(() => {
    // Set again on every run, not just once: in development the effect is mounted,
    // cleaned up and mounted again, and a flag left true would stop the watch below
    // on its first turn — leaving the button stuck on "Publishing…" for good.
    gone.current = false
    void refreshPending()

    return () => {
      gone.current = true
    }
  }, [refreshPending])

  /** Triggers the deploy hook and reports what happened. */
  const fire = async (done: string): Promise<boolean> => {
    setBusy(true)
    setNotice(null)
    const result = await publish()
    setNotice(result.ok ? done : PUBLISH_MESSAGE[result.reason])
    setBusy(false)
    return result.ok
  }

  /**
   * Publishes, then watches the list until the rebuild has taken these songs on.
   *
   * Firing the hook changes nothing that this screen can see, which is why the
   * list used to sit there unchanged and publishing looked like it had failed. What
   * empties the list is the build itself: it stamps the database as it starts, and
   * the list is every song written after that stamp.
   *
   * So the wait is real and worth showing, and the end of it means the songs are in
   * the build that is running — not that the site is live. Reporting more than that
   * would need Vercel's API; the wording here says what is actually known.
   */
  const publishPending = async () => {
    const fired = await fire('Rebuild started.')
    if (!fired) return

    setPublishing(true)

    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      if (gone.current) return

      const still = await refreshPending()
      // A read that failed says nothing; only an answered, empty list does.
      if (still !== null && still.length === 0) {
        setPublishing(false)
        setNotice(
          'Done: the songs are now in the rebuild. In a minute they will also be on the pages and available offline.',
        )
        return
      }
    }

    setPublishing(false)
    setNotice(
      'The rebuild does not seem to have started yet. Check the deploy on Vercel, or try again.',
    )
  }

  const download = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const files = await exportAll()
      if (files === null) {
        setNotice('Export failed: the server did not respond, or your role does not allow it.')
        return
      }
      if (files.length === 0) {
        setNotice('Nothing to export.')
        return
      }

      const zipped = zipSync(
        Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])),
      )
      const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'songs-chopro.zip'
      link.click()
      URL.revokeObjectURL(url)

      setNotice(`Downloaded ${files.length} songs. To restore them: put them back in content/ and run npm run seed.`)
    } catch {
      setNotice('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="section-title">Waiting to be published</h2>
      <p className="mt-1.5 text-sm leading-[1.45] text-muted">
        What you save shows up right away, here and in the list. Publishing rebuilds the pages:
        until you run it, these songs are not available offline. You can import several and
        publish them all at once.
      </p>

      {!online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          Without a connection you can&apos;t publish: reading the pending list needs the
          database, and publishing needs a deploy.
        </p>
      )}

      {notice !== null && (
        <p className="notice mt-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing waiting.</p>
      ) : (
        /* One card per song: each is a separate thing waiting, not a list to read. */
        <ul className="card-stack mt-3.5">
          {pending.map((song) => (
            <li key={song.slug} className="card flex items-center gap-3 px-4 py-3.5">
              <span className="count-badge" aria-hidden>
                <IconCheck size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{song.title}</span>
                {song.artist !== null && <span className="text-muted"> · {song.artist}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {publishing && (
        <p className="mt-3 text-sm text-muted" role="status">
          Publishing in progress: waiting for the rebuild to pick up these songs.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!online || busy || publishing || pending.length === 0}
          onClick={() => void publishPending()}
        >
          <IconPublish size={16} />
          {publishing ? 'Publishing…' : 'Publish'}
        </button>

        {/*
         * The same deploy hook as Publish, without the condition. Renaming a
         * songbook changes what the pages say without touching any song, so
         * nothing shows up as pending and Publish stays disabled — and the site
         * would keep the old name until the next unrelated publish.
         */}
        <button
          type="button"
          className="btn"
          disabled={!online || busy || publishing}
          onClick={() => void fire('Rebuild started. In a minute the site is updated.')}
        >
          <IconRebuild size={16} />
          Rebuild now
        </button>

        <button
          type="button"
          className="btn"
          disabled={!online || busy || publishing}
          onClick={() => void download()}
        >
          <IconDownload size={16} />
          Download all
        </button>
      </div>

      <p className="mt-3 text-xs text-faint">
        «Rebuild now» regenerates the site even with no songs waiting: needed after renaming a
        songbook or moving songs, since those changes do not show up in the list above.
      </p>
    </section>
  )
}
