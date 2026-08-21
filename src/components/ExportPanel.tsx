'use client'

import { zipSync, strToU8 } from 'fflate'
import { useEffect, useState } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { IconChevronDown, IconDownload, IconInfo, IconPrint } from '@/components/icons'
import { loadBooklet } from '@/lib/booklet/actions'
import { bookletToBlob } from '@/lib/booklet/document'
import type { Songbook } from '@/lib/data/types'
import { exportAll, exportOrganized, type ExportedFile } from '@/lib/import/actions'
import { loadSongbooks } from '@/lib/songbooks/actions'

/** Triggers a blob's download — the part every export shares, zipped or not. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Builds the zip in the browser and triggers its download. */
function downloadZip(files: ExportedFile[], filename: string) {
  const zipped = zipSync(Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])))
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename)
}

/**
 * A backup of the current account's repertoire, one `.chopro` per song, plus a second,
 * separate export organized for a person to browse or print rather than to restore.
 *
 * Everything about *publishing* that used to live alongside this (v3.0) is gone with the
 * static build it existed for: every page is dynamic now, so a save is already the live
 * page, and there is nothing left to wait for or trigger. The backup is what remains of
 * that — a plain export, useful on its own terms as the restore path `npm run seed` reads
 * back from. The organized export is not: it has folders per songbook and section, and
 * numbered names, which is exactly what the restore path cannot read back (see
 * `exportOrganized`'s own comment) — so it stays a one-way, look-don't-touch download.
 */
export function ExportPanel() {
  const { global } = usePrefs()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /*
   * Fetched once, on mount, rather than threaded in as a prop: this panel is
   * the only screen that needs a plain list of songbook names, and the page
   * around it (`app/export/page.tsx`) has no reason to carry a songbook
   * provider for one card that uses it.
   */
  const [songbooks, setSongbooks] = useState<Songbook[] | null>(null)
  const [bookletSlug, setBookletSlug] = useState('')

  useEffect(() => {
    let cancelled = false
    loadSongbooks()
      .then((state) => {
        if (cancelled || state === null) return
        setSongbooks(state.songbooks)
        setBookletSlug((current) => current || (state.songbooks[0]?.slug ?? ''))
      })
      .catch(() => {
        // Offline: the picker stays empty, and the button below refuses on its own.
      })
    return () => {
      cancelled = true
    }
  }, [])

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

      downloadZip(files, 'songs-chopro.zip')
      setNotice(`Downloaded ${files.length} songs. To restore them: put them back in content/ and run npm run seed.`)
    } catch {
      setNotice('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const downloadOrganized = async (granularity: 'song' | 'section') => {
    setBusy(true)
    setNotice(null)
    try {
      const files = await exportOrganized(granularity)
      if (files === null) {
        setNotice('Export failed: the server did not respond, or your role does not allow it.')
        return
      }
      if (files.length === 0) {
        setNotice('Nothing to export.')
        return
      }

      downloadZip(files, granularity === 'song' ? 'songbooks-by-song.zip' : 'songbooks-by-section.zip')
      setNotice(`Downloaded ${files.length} file${files.length === 1 ? '' : 's'}, organized by songbook and section.`)
    } catch {
      setNotice('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  const downloadBooklet = async () => {
    if (bookletSlug === '') return

    setBusy(true)
    setNotice(null)
    try {
      const result = await loadBooklet(bookletSlug)
      if (!result.ok) {
        /*
         * Two different sentences, because they have two different remedies: a plan
         * without the booklet will answer the same way however many times the button is
         * pressed, so «the server did not respond» would be an invitation to keep trying.
         * No link is offered with it — there is nowhere in the app to send anybody yet.
         */
        setNotice(
          result.reason === 'not-found'
            ? 'Export failed: the server did not respond, or your role does not allow it.'
            : 'The printable booklet is not part of your plan.',
        )
        return
      }
      const { booklet, brandLine } = result
      if (booklet.sections.every((section) => section.songs.length === 0)) {
        setNotice('Nothing to export: this songbook has no songs yet.')
        return
      }

      const blob = await bookletToBlob(booklet, global.notation, brandLine)
      downloadBlob(blob, `${booklet.songbookName}.pdf`)
      setNotice(`Downloaded "${booklet.songbookName}" as a printable booklet.`)
    } catch {
      setNotice('Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-3">
      {notice !== null && (
        <p className="notice" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      <div className="card info-card">
        <div className="info-card-main">
          <span className="row-icon" aria-hidden>
            <IconDownload size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Backup</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              Download every song in this account as a single zip — yours to keep, and ready to
              bring back in with <code>npm run seed</code> whenever you need it.
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void download()}>
          <IconDownload size={16} />
          Download all
        </button>
      </div>

      <div className="card info-card">
        <div className="info-card-main">
          <span className="row-icon" aria-hidden>
            <IconDownload size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Organized export</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              The same songs, in folders — one per songbook, numbered sections inside — meant for
              reading or printing outside the app, not for restoring.
            </p>
          </div>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void downloadOrganized('song')}
          >
            <IconDownload size={16} />
            By song
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void downloadOrganized('section')}
          >
            <IconDownload size={16} />
            By section
          </button>
        </div>
      </div>

      <div className="card info-card">
        <div className="info-card-main">
          <span className="row-icon" aria-hidden>
            <IconPrint size={19} />
          </span>
          <div className="info-card-body">
            <h2 className="section-title">Printable booklet</h2>
            <p className="mt-1.5 text-[0.90625rem] leading-[1.45] text-muted">
              One songbook as a typeset PDF — chords above the words, one song per page, in the
              key it was written in — meant to be printed and handed out.
            </p>
          </div>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <label className="picker picker-raised">
            <span className="sr-only">Songbook to print</span>
            <select
              value={bookletSlug}
              onChange={(event) => setBookletSlug(event.target.value)}
              disabled={songbooks === null || songbooks.length === 0}
              className="picker-select"
            >
              {songbooks === null || songbooks.length === 0 ? (
                <option value="">No songbook yet</option>
              ) : (
                songbooks.map((songbook) => (
                  <option key={songbook.slug} value={songbook.slug}>
                    {songbook.name}
                  </option>
                ))
              )}
            </select>
            <IconChevronDown size={14} />
          </label>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || bookletSlug === ''}
            onClick={() => void downloadBooklet()}
          >
            <IconDownload size={16} />
            Download PDF
          </button>
        </div>
      </div>
    </section>
  )
}
