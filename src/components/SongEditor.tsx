'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { SongForm } from '@/components/SongForm'
import { useSong } from '@/components/SongProvider'
import { IconPencil } from '@/components/icons'
import type { Canzoniere } from '@/lib/data/types'

/**
 * Correcting the song you are reading, from where you noticed the mistake.
 *
 * A disclosure below the sheet rather than a mode that replaces it: the form
 * carries its own preview, and this way nothing about the reading page changes
 * for anyone who never opens it.
 *
 * The form is filled from the song the provider holds, not from the page, so a
 * save shows in the sheet above the moment it lands and reopening the form finds
 * the words that were saved. Publishing is still worth doing, but it is now only
 * about the pages being right offline — not about seeing your own work.
 */
export function SongEditor({ canzonieri }: { canzonieri: Canzoniere[] }) {
  const router = useRouter()
  const { song, save, remove } = useSong()
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
          const result = await save(input, decision)
          if (result.ok) {
            setOpen(false)
            setNotice('Salvato. Pubblica quando vuoi averlo anche senza connessione.')
          }
          return result
        }}
        onDelete={async () => {
          const result = await remove()
          if (result.ok) router.push('/')
          else setNotice('Eliminazione non riuscita.')
        }}
      />
    </section>
  )
}
