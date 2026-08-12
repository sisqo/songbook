import type { Metadata } from 'next'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { ImportScreen } from '@/components/ImportScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { snapshot } from '@/lib/canzonieri/snapshot'
import { UNFILED, repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Importa' }

/**
 * Static shell, precached like the rest. Everything mutable — the pending list —
 * is read at runtime, so the page itself never needs regenerating to be correct.
 *
 * The canzonieri too, through the provider rather than the baked list: this screen
 * asks which one to import into, and one made a minute ago on `/canzonieri` has no
 * page of its own to wait for. Offering a stale set of destinations here would be
 * the same bug as a stale song — the build is not the authority on what exists.
 */
export default async function ImportPage() {
  const [canzonieri, songs, sections] = await Promise.all([
    repository.listCanzonieri(),
    repository.listSongs(),
    repository.listSections(),
  ])

  const preferred =
    canzonieri.find((entry) => entry.slug === UNFILED.slug)?.slug ??
    canzonieri[0]?.slug ??
    UNFILED.slug


  return (
    // The preview renders a real sheet, which reads zoom and notation from here.
    <PrefsProvider songSlug={null}>
      <CanzoniereProvider initial={snapshot(songs, canzonieri, sections)}>
        <TopBar current="importa" />

        <main className="mx-auto max-w-5xl px-4 pb-12 pt-3">
          <h1 className="screen-title mb-4">Importa</h1>

          <ImportScreen defaultCanzoniere={preferred} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
