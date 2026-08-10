import type { Metadata } from 'next'

import { ImportScreen } from '@/components/ImportScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { UNFILED, repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Importa' }

/**
 * Static shell, precached like the rest. Everything mutable — the pending list —
 * is read at runtime, so the page itself never needs regenerating to be correct.
 */
export default async function ImportPage() {
  const [canzonieri, setlists] = await Promise.all([
    repository.listCanzonieri(),
    repository.listSetlists(),
  ])

  const preferred =
    canzonieri.find((entry) => entry.slug === UNFILED.slug)?.slug ??
    canzonieri[0]?.slug ??
    UNFILED.slug

  return (
    // The preview renders a real sheet, which reads zoom and notation from here.
    <PrefsProvider songSlug={null}>
      <TopBar current="importa" showSetlists={setlists.length > 0} />

      <main className="mx-auto max-w-5xl px-4 pb-12 pt-5">
        <h1 className="mb-5 text-[1.75rem] font-semibold leading-tight tracking-tight">
          Importa
        </h1>

        <ImportScreen canzonieri={canzonieri} defaultCanzoniere={preferred} />
      </main>
    </PrefsProvider>
  )
}
