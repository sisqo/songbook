'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { SongForm } from '@/components/SongForm'
import { IconPencil } from '@/components/icons'
import type { Canzoniere, Song } from '@/lib/data/types'
import { deleteSong, saveSong } from '@/lib/import/actions'

/**
 * Correcting the song you are reading, from where you noticed the mistake.
 *
 * A disclosure below the sheet rather than a mode that replaces it: the form
 * carries its own preview, and this way nothing about the reading page changes
 * for anyone who never opens it.
 *
 * Saving does not change what is on screen — the page is static — so it says so
 * instead of pretending. Deleting leaves for the list, since this page is about
 * to stop existing.
 */
export function SongEditor({ song, canzonieri }: { song: Song; canzonieri: Canzoniere[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!open) {
    return (
      <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        {notice !== null && (
          <p className="mb-3 text-sm text-muted" role="status">
            {notice}
          </p>
        )}
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <IconPencil size={16} />
          Modifica
        </button>
      </div>
    )
  }

  return (
    <section className="mt-10 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Modifica</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>
          Chiudi
        </button>
      </div>

      <SongForm
        slug={song.slug}
        canzonieri={canzonieri}
        initial={{
          title: song.title,
          artist: song.artist ?? '',
          originalKey: song.originalKey ?? '',
          tags: song.tags.join(', '),
          canzoniereSlug: song.canzoniereSlug ?? canzonieri[0]?.slug ?? '',
          body: song.body,
        }}
        onSave={async (input, decision) => {
          const result = await saveSong(input, decision)
          if (result.ok) {
            setOpen(false)
            setNotice('Salvato. La pagina si aggiorna dopo la pubblicazione, in Importa.')
          }
          return result
        }}
        onDelete={async () => {
          const result = await deleteSong(song.slug)
          if (result.ok) router.push('/')
          else setNotice('Eliminazione non riuscita.')
        }}
      />
    </section>
  )
}
