'use client'

import { zipSync, strToU8 } from 'fflate'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ImportBatch } from '@/components/ImportBatch'
import { useSongbooks } from '@/components/SongbookProvider'
import { RoleNotice } from '@/components/RoleNotice'
import { useRole } from '@/components/RoleProvider'
import { SongForm } from '@/components/SongForm'
import {
  IconCheck,
  IconDownload,
  IconInfo,
  IconOffline,
  IconPlus,
  IconPublish,
  IconRebuild,
} from '@/components/icons'
import { WRITE_MESSAGE } from '@/lib/songbooks/types'
import { exportAll, loadPending, publish, saveSong } from '@/lib/import/actions'
import { type PreparedSong, prepareSongs } from '@/lib/import/prepare'
import { PUBLISH_MESSAGE, type PendingSong } from '@/lib/import/types'

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'recognized as ChordPro, passed through as is',
  'chords-above': 'chords above lyrics, converted',
  'lyrics-only': 'no chords found: lyrics only',
}

/**
 * Where the songs come in. Plus the list of songs waiting to be published, the
 * publish action, and the export.
 *
 * Three steps, in this order and numbered: where they go, the text, then what was
 * understood. The destination comes first because it is the one answer that holds
 * for the whole paste — and because it used to be the fourth field of a form that
 * appeared only after the text had been analysed, which is a strange moment to be
 * asked where you are putting something.
 *
 * The analysis is a guess and stays visible before anything is written: one song
 * gets the full form with a live preview, several get a row each. Neither saves
 * until it is asked to.
 */
export function ImportScreen({ defaultSongbook }: { defaultSongbook: string }) {
  const {
    songbooks,
    online,
    create,
    addSection,
    divisionsOf,
    refresh: refreshSongbooks,
  } = useSongbooks()
  const { known, mayEdit } = useRole()

  const [destination, setDestination] = useState(defaultSongbook)
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  /** The section chosen inside it, as the select holds it. */
  const [into, setInto] = useState('')
  const [namingSection, setNamingSection] = useState(false)
  const [newSection, setNewSection] = useState('')

  const [pasted, setPasted] = useState('')
  const [prepared, setPrepared] = useState<PreparedSong[] | null>(null)

  const [pending, setPending] = useState<PendingSong[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  /** Set when this screen goes away, so the watch below stops with it. */
  const gone = useRef(false)

  /*
   * The chosen songbook, checked against the ones that exist.
   *
   * The default is baked into this page at build time, and the live list arrives a
   * moment later: a songbook removed since the build would leave the select with
   * a value none of its options carry, which browsers render as blank. Resolving it
   * at render rather than in an effect means there is no frame where that is true.
   */
  const chosen = songbooks.some((entry) => entry.slug === destination)
    ? destination
    : (songbooks[0]?.slug ?? '')
  const chosenName = songbooks.find((entry) => entry.slug === chosen)?.name ?? 'No songbook'

  /*
   * And its section, resolved the same way and for the same reason: the sections on offer
   * change with the songbook above, so a value held from before could name a section of
   * somewhere else — which the database refuses outright. Falling back to the first
   * section of the chosen songbook means the answer is always somewhere real.
   */
  const divisions = divisionsOf(chosen)
  const chosenSection = divisions.some((section) => String(section.id) === into)
    ? divisions.find((section) => String(section.id) === into)
    : divisions[0]

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

  const addSongbook = async () => {
    setError(null)
    const result = await create(newName)

    if (!result.ok) {
      setError(WRITE_MESSAGE[result.reason])
      return
    }

    // Chosen straight away: making one here means wanting to import into it.
    setDestination(result.slug)
    // Its own «Songs» comes with it, and the select will land on it by itself.
    setInto('')
    setNewName('')
    setNaming(false)
  }

  /**
   * A section made here, for this paste.
   *
   * Pasting the running order of an evening *is* making a section, so it can be made
   * without leaving the screen — the same shortcut the songbook above has, and for the
   * same reason. A name that is already taken is not an error here: the action answers
   * with that section, and the songs join it.
   */
  const addDivision = async () => {
    setError(null)
    const result = await addSection(chosen, newSection)

    if (!result.ok) {
      setError(WRITE_MESSAGE[result.reason])
      return
    }

    setInto(String(result.id))
    setNewSection('')
    setNamingSection(false)
  }

  const analyse = () => {
    const found = prepareSongs(pasted)
    setError(null)

    if (found.length === 0) {
      setNotice('No songs found in this text.')
      return
    }

    setNotice(null)
    setPrepared(found)
  }

  const startOver = () => {
    setPrepared(null)
    setPasted('')
  }

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

  const single = prepared !== null && prepared.length === 1 ? prepared[0] : null

  /*
   * Nothing at all until the role is known, then either the screen or the reason.
   * The actions refuse a viewer on their own; this is so nobody gets as far as pasting a
   * song in and pressing a button to find out.
   */
  if (!known) return null
  if (!mayEdit) return <RoleNotice needed="Editor" what="import or edit songs" />

  return (
    <div>
      {!online && (
        <p className="notice notice-accent mb-4">
          <IconOffline />
          Without a connection you can&apos;t import: saving requires the database, and publishing
          requires a deploy.
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {notice !== null && (
        <p className="notice mb-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      <div className="card p-4 sm:p-5">
        <label className="block">
          <span className="field-label">1. Which songbook</span>
          <select
            value={chosen}
            onChange={(event) => setDestination(event.target.value)}
            className="form-field"
          >
            {songbooks.map((songbook) => (
              <option key={songbook.slug} value={songbook.slug}>
                {songbook.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="field-label">Which section</span>
          <select
            value={chosenSection === undefined ? '' : String(chosenSection.id)}
            onChange={(event) => setInto(event.target.value)}
            className="form-field"
            disabled={divisions.length === 0}
          >
            {divisions.map((section) => (
              <option key={section.id} value={String(section.id)}>
                {section.name}
              </option>
            ))}
          </select>
        </label>

        {namingSection ? (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void addDivision()
            }}
          >
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Name of the new section</span>
              <input
                value={newSection}
                onChange={(event) => setNewSection(event.target.value)}
                placeholder="Name of the new section"
                autoFocus
                className="form-field"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!online || newSection.trim() === ''}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setNamingSection(false)
                setNewSection('')
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-sm mt-2"
            disabled={!online}
            onClick={() => setNamingSection(true)}
          >
            <IconPlus size={15} />
            New section
          </button>
        )}

        {naming ? (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void addSongbook()
            }}
          >
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Name of the new songbook</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Name of the new songbook"
                autoFocus
                className="form-field"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!online || newName.trim() === ''}>
              Create
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setNaming(false)
                setNewName('')
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-sm mt-2"
            disabled={!online}
            onClick={() => setNaming(true)}
          >
            <IconPlus size={15} />
            New songbook
          </button>
        )}
      </div>

      {prepared === null && (
        /* The one card on the screen you have come here to use, so it is the one lifted. */
        <div className="card card-lead mt-3 p-4 sm:p-5">
          <label className="block">
            <span className="field-label">2. Paste the songs</span>

            {/*
              * Above the box rather than under it: it says what will happen to what
              * you paste, which is worth knowing before pasting rather than after.
              */}
            <span className="mb-2.5 block text-sm leading-[1.45] text-muted">
              If it has chords in square brackets it&apos;s already ChordPro; otherwise conversion
              from chords-above-lyrics is attempted. Multiple songs at once: separate them with a
              line of <code>---</code>, or paste a ChordPro export — its{' '}
              <code>{'{title}'}</code> lines are enough.
            </span>

            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={'Certe notti\nLigabue\n\nAm        F\nCerte notti la macchina\n\n---\n\nAlbachiara\nVasco Rossi'}
              className="form-field font-mono text-sm"
            />
          </label>

          <button
            type="button"
            className="btn btn-primary mt-3.5"
            disabled={!online || pasted.trim() === ''}
            onClick={analyse}
          >
            Analyze
          </button>
        </div>
      )}

      {single !== null && (
        <div className="card mt-3 p-4 sm:p-5">
          <p className="mb-4 text-xs text-muted">
            {FORMAT_LABEL[single.format] ?? single.format} · goes into {chosenName}
            {chosenSection !== undefined && ` · ${chosenSection.name}`}
            {single.declares !== null && single.declares !== chosenName && (
              <> · the text says «{single.declares}»</>
            )}
            {' · '}
            <button type="button" className="underline underline-offset-2" onClick={startOver}>
              paste another song
            </button>
          </p>

          <SongForm
            initial={{
              title: single.title,
              artist: single.artist,
              tags: single.tags,
              songbookSlug: chosen,
              sectionId: chosenSection === undefined ? '' : String(chosenSection.id),
              body: single.body,
            }}
            songbooks={songbooks}
            sections={divisions}
            showSongbook={false}
            onSave={async (input, decision) => {
              // The selects above are the answer, even if they changed after the analysis.
              const result = await saveSong(
                {
                  ...input,
                  songbookSlug: chosen,
                  sectionId: chosenSection?.id ?? null,
                },
                decision,
              )
              if (result.ok) {
                startOver()
                setNotice('Saved. It is already in the list; publish to have it available offline too.')
                await Promise.all([refreshPending(), refreshSongbooks()])
              }
              return result
            }}
          />
        </div>
      )}

      {prepared !== null && prepared.length > 1 && (
        <div className="mt-3">
          <ImportBatch
            songs={prepared}
            songbookSlug={chosen}
            songbookName={chosenName}
            sectionId={chosenSection?.id ?? null}
            sectionName={chosenSection?.name ?? null}
            online={online}
            onDone={async () => {
              await Promise.all([refreshPending(), refreshSongbooks()])
            }}
            onReset={startOver}
          />
        </div>
      )}

      {/* Space instead of a rule: nothing else on these screens is separated by one. */}
      <section className="mt-8">
        <h2 className="section-title">Waiting to be published</h2>
        <p className="mt-1.5 text-sm leading-[1.45] text-muted">
          What you save shows up right away, here and in the list. Publishing rebuilds the pages:
          until you run it, these songs are not available offline. You can import several and
          publish them all at once.
        </p>

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
    </div>
  )
}
