'use client'

import { zipSync, strToU8 } from 'fflate'
import { useState } from 'react'

import { IconDownload, IconInfo } from '@/components/icons'
import { exportAll, exportOrganized, type ExportedFile } from '@/lib/import/actions'

/** Builds the zip in the browser and triggers its download — the part every export shares. */
function downloadZip(files: ExportedFile[], filename: string) {
  const zipped = zipSync(Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])))
  const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <section className="mt-8">
      <h2 className="section-title">Backup</h2>
      <p className="mt-1.5 text-sm leading-[1.45] text-muted">
        Every song of this account, as ChordPro files in a zip — the same format
        <code> npm run seed </code>
        reads back.
      </p>

      {notice !== null && (
        <p className="notice mt-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      <div className="mt-4">
        <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
          <IconDownload size={16} />
          Download all
        </button>
      </div>

      <h2 className="section-title mt-6">Organized export</h2>
      <p className="mt-1.5 text-sm leading-[1.45] text-muted">
        The same songs, in folders — one per songbook, numbered sections inside — meant for
        reading or printing outside the app, not for restoring: numbered names are not what
        <code> npm run seed </code>
        reads back.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={busy} onClick={() => void downloadOrganized('song')}>
          <IconDownload size={16} />
          Export by song
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void downloadOrganized('section')}>
          <IconDownload size={16} />
          Export by section
        </button>
      </div>
    </section>
  )
}
