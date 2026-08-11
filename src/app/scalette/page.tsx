import type { Metadata } from 'next'
import Link from 'next/link'

import { TopBar } from '@/components/TopBar'
import { IconChevronRight } from '@/components/icons'
import { repository } from '@/lib/data'

export const metadata: Metadata = { title: 'Scalette' }

export default async function SetlistsPage() {
  const setlists = await repository.listSetlists()

  return (
    <>
      <TopBar current="scalette" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <h1 className="screen-title mb-[1.125rem]">Scalette</h1>

        {setlists.length === 0 ? (
          <p className="text-sm text-muted">
            Nessuna scaletta. Le scalette si definiscono in <code>content/setlists/</code>.
          </p>
        ) : (
          /* A card each, and each one leads somewhere: hence the chevron and the lift. */
          <ul className="card-stack">
            {setlists.map((setlist) => (
              <li key={setlist.slug}>
                <Link
                  href={`/scalette/${setlist.slug}`}
                  className="card row-head text-[1.0625rem]"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{setlist.name}</span>
                  <span className="count-badge">{setlist.songs.length}</span>
                  <IconChevronRight size={18} className="text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
