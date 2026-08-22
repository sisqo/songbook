import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'

export const metadata: Metadata = { title: 'Pages' }

/** Nothing here reads from the database, but the owner check itself depends on the request, same as `/emails`. */
export const dynamic = 'force-dynamic'

interface PageLink {
  href: string
  label: string
  description: string
}

/**
 * Pages a global owner needs to open directly and nothing else in the app links to — starting
 * with the thank-you preview (see `ThanksScreen`'s own comment on what `?preview=<plan>` does
 * and how `loadThanksPreview` gates it). A plain literal list rather than anything generated:
 * each entry here is a page somebody decided was worth a bookmark, not every route the app
 * happens to have. `Footer` already covers the ones every reader can already find — legal
 * pages, `/brand`, `/changelog` — so those have no reason to repeat here.
 */
const LINKS: PageLink[] = [
  {
    href: '/thanks?preview=premium',
    label: 'Thank-you page',
    description:
      'What a purchase lands on. Sample data for every plan, switchable once open — no purchase, mock or real, required.',
  },
]

/**
 * A global-owner-only index of the pages above. `notFound()` rather than a role notice, the
 * same reasoning as every other owner-only page in this app (`/accounts`, `/emails`): "this
 * does not exist" and "this is not yours" should look identical from outside.
 */
export default async function PagesPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="pages" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Pages</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Screens worth opening directly that nothing else in the app links to.
          </p>
        </header>

        <ul className="card-stack">
          {LINKS.map((link) => (
            <li key={link.href} className="card flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block">{link.label}</span>
                <span className="mt-1 block text-[0.8125rem] text-muted">{link.description}</span>
              </span>
              <Link href={link.href} className="btn btn-sm">
                Open
              </Link>
            </li>
          ))}
        </ul>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
