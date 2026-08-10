import type { Metadata } from 'next'
import Link from 'next/link'

import { CanzoniereManager } from '@/components/CanzoniereManager'
import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Canzonieri' }

/**
 * The only new route the feature adds: a static shell, precached like the rest.
 *
 * There is deliberately no `/canzonieri/[slug]` page. One created in the app
 * would not exist among the routes generated at build time, so it would not be
 * precached and would be missing offline; and a rename would move the route.
 * Viewing a canzoniere is the filtered song list at `/?c=slug` instead.
 */
export default async function CanzonieriPage() {
  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
  ])

  const initial: CanzoniereState = {
    canzonieri,
    assignments: Object.fromEntries(
      songs
        .filter((song) => song.canzoniereSlug !== null)
        .map((song) => [song.slug, song.canzoniereSlug as string]),
    ),
  }

  return (
    <CanzoniereProvider initial={initial}>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5">
          <nav className="mb-2 text-sm" style={{ color: 'var(--muted)' }}>
            <Link href="/" className="underline-offset-2 hover:underline">
              ‹ Tutte le canzoni
            </Link>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">Canzonieri</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Ogni brano appartiene a un canzoniere. Le scalette sono un&apos;altra cosa e possono
            mescolarli.
          </p>
        </header>

        <CanzoniereManager />
      </main>
    </CanzoniereProvider>
  )
}
