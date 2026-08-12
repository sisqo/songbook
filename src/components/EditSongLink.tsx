'use client'

import Link from 'next/link'

import { useRole } from '@/components/RoleProvider'
import { IconPencil } from '@/components/icons'
import { useOnline } from '@/lib/useOnline'

/**
 * The way into the editor, for the people who have one.
 *
 * A client component for one link, because the page around it is generated at build time
 * and cannot know who is reading. It takes two rules at its foot with it.
 *
 * **A role that may edit.** Nothing at all for a viewer, rather than a button that would
 * refuse, and nothing until the role is known.
 *
 * **A network.** This was the app's only write control without that condition, and it took
 * an adversarial read to see why it needed one: the editor route is deliberately
 * `NetworkOnly` in the service worker with no fallback, so offline the tap does not reach an
 * editor that cannot save — it fails the navigation outright and lands on the browser's own
 * error page, outside the installed shell, with the back gesture as the only way home. Every
 * other control that writes already disables itself without a network, and this is what
 * `useOnline` exists for: controls that would otherwise look available and quietly do
 * nothing. So the link comes back when the signal does.
 *
 * The rule above it goes too. It exists to separate the song from what you do to it, and
 * with nothing to do there is nothing to separate.
 */
export function EditSongLink({ slug }: { slug: string }) {
  const { mayEdit } = useRole()
  const online = useOnline()

  if (!mayEdit || !online) return null

  return (
    <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
      <Link href={`/canzoni/${slug}/modifica`} className="btn is-inset">
        <IconPencil size={16} />
        Modifica
      </Link>
    </div>
  )
}
