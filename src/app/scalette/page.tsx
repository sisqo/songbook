import type { Metadata } from 'next'
import Link from 'next/link'

import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Scalette' }

export default async function SetlistsPage() {
  const setlists = await repository.listSetlists()

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <nav className="mb-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Link href="/" className="underline-offset-2 hover:underline">
            ‹ Tutte le canzoni
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Scalette</h1>
      </header>

      {setlists.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Nessuna scaletta. Le scalette si definiscono in <code>content/setlists/</code>.
        </p>
      ) : (
        <ul>
          {setlists.map((setlist) => (
            <li key={setlist.slug} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <Link
                href={`/scalette/${setlist.slug}`}
                className="flex items-baseline justify-between gap-3 py-3"
              >
                <span className="font-medium">{setlist.name}</span>
                <span className="flex-none text-sm" style={{ color: 'var(--muted)' }}>
                  {setlist.songs.length} {setlist.songs.length === 1 ? 'brano' : 'brani'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
