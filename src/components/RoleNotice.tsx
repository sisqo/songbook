'use client'

import { useRole } from '@/components/RoleProvider'
import { IconInfo } from '@/components/icons'

/** How each role is named on screen, which is how the person was told about it. */
const NAME = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const

/**
 * What to put where a tool would have been.
 *
 * Reached by typing the address, or by a link that was open before the role arrived. The
 * screens themselves cannot refuse — they are generated at build time and precached, so
 * they are the same page for everybody — and the actions behind them refuse anyway. This
 * is the sentence that turns a refusal into an explanation.
 *
 * It names the role they have as well as the one they would need: "serve Editor" alone
 * invites the reply "but I am an editor", and the answer to that is on the server.
 */
export function RoleNotice({ needed, what }: { needed: 'Editor' | 'Admin'; what: string }) {
  const { role } = useRole()

  return (
    <p className="notice notice-accent" role="status">
      <IconInfo />
      <span>
        Serve il ruolo <strong>{needed}</strong> per {what}.
        {role !== null && ` Il tuo è ${NAME[role]}.`}
      </span>
    </p>
  )
}
