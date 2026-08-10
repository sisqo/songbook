import type { Metadata } from 'next'
import Link from 'next/link'

import { ImportScreen } from '@/components/ImportScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { UNFILED, repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Importa' }

/**
 * Static shell, precached like the rest. Everything mutable — the pending list —
 * is read at runtime, so the page itself never needs regenerating to be correct.
 */
export default async function ImportPage() {
  const canzonieri = await repository.listCanzonieri()

  const preferred =
    canzonieri.find((entry) => entry.slug === UNFILED.slug)?.slug ??
    canzonieri[0]?.slug ??
    UNFILED.slug

  return (
    // The preview renders a real sheet, which reads zoom and notation from here.
    <PrefsProvider songSlug={null}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-5">
          <nav className="mb-2 text-sm" style={{ color: 'var(--muted)' }}>
            <Link href="/" className="underline-offset-2 hover:underline">
              ‹ Tutte le canzoni
            </Link>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">Importa</h1>
        </header>

        <ImportScreen canzonieri={canzonieri} defaultCanzoniere={preferred} />
      </main>
    </PrefsProvider>
  )
}
