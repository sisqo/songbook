'use client'

import { zipSync, strToU8 } from 'fflate'
import { useState } from 'react'

import { IconDownload, IconInfo } from '@/components/icons'
import { exportAll } from '@/lib/import/actions'

/**
 * A backup of the current account's repertoire, one `.chopro` per song.
 *
 * Everything about *publishing* that used to live alongside this (v3.0) is gone with the
 * static build it existed for: every page is dynamic now, so a save is already the live
 * page, and there is nothing left to wait for or trigger. This is what remains — a plain
 * export, useful on its own terms as the restore path `npm run seed` reads back from.
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
    </section>
  )
}
