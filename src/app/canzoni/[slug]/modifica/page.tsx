import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { EditorScreen } from '@/components/editor/EditorScreen'
import { IconInfo } from '@/components/icons'
import { currentUser } from '@/lib/auth/session'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'
import { canEdit } from '@/lib/roles'

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Rendered per request, never generated and never precached.
 *
 * Every other page here is static so it survives without a network. This one must
 * not be: it has to open the version the database holds right now, and it cannot do
 * its job — saving — offline anyway. A precached editor would be worse than none,
 * showing the words as they were at the last deploy and losing whatever was typed
 * into them.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const song = await repository.getSong(slug)

  return { title: song === null ? 'Modifica' : `Modifica · ${song.title}` }
}

export default async function EditSongPage({ params }: Props) {
  const { slug } = await params

  const [song, canzonieri, user] = await Promise.all([
    repository.getSong(slug),
    repository.listCanzonieri(),
    currentUser(),
  ])

  if (song === null) notFound()

  /*
   * The one page in the app that can refuse on the server, and it does.
   *
   * Everywhere else the role is checked in the browser, because the pages are generated
   * at build time and are the same for everybody. This one is rendered per request, so a
   * viewer who types the address gets an answer instead of an editor full of controls
   * that would refuse — and the words of the song are not sent to them at all.
   */
  if (!canEdit(user?.role ?? null)) {
    return (
      <PrefsProvider songSlug={null}>
        <TopBar current="canzoni" back={{ href: `/canzoni/${slug}`, label: 'Torna al brano' }} />

        <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
          <h1 className="screen-title mb-4">Modifica</h1>
          <p className="notice notice-accent" role="status">
            <IconInfo />
            <span>
              Serve il ruolo <strong>Editor</strong> per modificare un brano.
            </span>
          </p>
        </main>
      </PrefsProvider>
    )
  }

  const initial: CanzoniereState = {
    canzonieri,
    assignments: song.canzoniereSlug === null ? {} : { [song.slug]: song.canzoniereSlug },
  }

  return (
    // The preview renders a real sheet and the real control bar, both of which read
    // this song's zoom, notation and transposition from here.
    <PrefsProvider songSlug={song.slug}>
      <CanzoniereProvider initial={initial} refreshOnMount={false}>
        <TopBar current="canzoni" />

        <main className="mx-auto max-w-3xl px-4 pb-12">
          <EditorScreen song={song} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
