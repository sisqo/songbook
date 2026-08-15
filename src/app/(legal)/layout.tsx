import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconChevronLeft } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'

/**
 * The shell shared by the four legal pages — Privacy, Terms, Cookies, Copyright
 * (`middleware.ts` lists all four as reachable with no session). None of the app's
 * own chrome belongs here: no `TopBar`, no menu built for a signed-in reader mid-song.
 * These are read by people who may never sign in at all — a visitor deciding whether
 * to register, a store reviewer, a data protection authority — so the only navigation
 * is a way back to the one page that is reachable the same way.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-8 sm:pt-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <IconChevronLeft size={15} />
        {APP_NAME}
      </Link>

      <article className="legal-content mt-6">{children}</article>

      <Footer />
    </main>
  )
}
