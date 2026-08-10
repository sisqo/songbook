import type { Metadata } from 'next'
import Link from 'next/link'

import { TopBar } from '@/components/TopBar'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Scalette' }

export default async function SetlistsPage() {
  const setlists = await repository.listSetlists()

  return (
    <>
      <TopBar current="scalette" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-5">
        <h1 className="mb-5 text-[1.75rem] font-semibold leading-tight tracking-tight">
          Scalette
        </h1>

        {setlists.length === 0 ? (
          <p className="text-sm text-muted">
            Nessuna scaletta. Le scalette si definiscono in <code>content/setlists/</code>.
          </p>
        ) : (
          <ul className="row-list card">
            {setlists.map((setlist) => (
              <li key={setlist.slug}>
                <Link href={`/scalette/${setlist.slug}`} className="row">
                  <span className="flex-1 font-medium">{setlist.name}</span>
                  <span className="count-badge">{setlist.songs.length}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
