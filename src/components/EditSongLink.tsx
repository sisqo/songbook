'use client'

import Link from 'next/link'

import { useRole } from '@/components/RoleProvider'
import { IconPencil } from '@/components/icons'

/**
 * The way into the editor, for the people who have one.
 *
 * A client component for one link, because the page around it is generated at build time
 * and cannot know who is reading. It takes the rule at its foot with it: nothing at all for
 * a viewer, rather than a button that would refuse — and nothing until the role is known,
 * which on a cold start with no network is the whole time.
 *
 * Once the role *has* arrived it stays known, so an editor who then loses signal keeps this
 * link and gets as far as an editor that cannot save. That is the right way round of the
 * two: the alternative is taking a control away from somebody who is entitled to it because
 * their train went into a tunnel, and the editor page says plainly that it needs the network.
 *
 * The rule above it goes too. It exists to separate the song from what you do to it, and
 * with nothing to do there is nothing to separate.
 */
export function EditSongLink({ slug }: { slug: string }) {
  const { mayEdit } = useRole()

  if (!mayEdit) return null

  return (
    <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
      <Link href={`/canzoni/${slug}/modifica`} className="btn is-inset">
        <IconPencil size={16} />
        Modifica
      </Link>
    </div>
  )
}
