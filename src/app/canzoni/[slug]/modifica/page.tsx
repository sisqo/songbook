import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { EditorScreen } from '@/components/editor/EditorScreen'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { repository } from '@/lib/data'

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

  const [song, canzonieri, setlists] = await Promise.all([
    repository.getSong(slug),
    repository.listCanzonieri(),
    repository.listSetlists(),
  ])

  if (song === null) notFound()

  const initial: CanzoniereState = {
    canzonieri,
    assignments: song.canzoniereSlug === null ? {} : { [song.slug]: song.canzoniereSlug },
  }

  return (
    // The preview renders a real sheet and the real control bar, both of which read
    // this song's zoom, notation and transposition from here.
    <PrefsProvider songSlug={song.slug}>
      <CanzoniereProvider initial={initial} refreshOnMount={false}>
        <TopBar current="canzoni" showSetlists={setlists.length > 0} />

        <main className="mx-auto max-w-3xl px-4 pb-12">
          <EditorScreen song={song} />
        </main>
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
