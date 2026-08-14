'use client'

import { IconInfo } from '@/components/icons'

/**
 * What to put where a tool would have been.
 *
 * Reached by typing the address, or by a link that was open before the role arrived. The
 * screens themselves cannot refuse — they are generated at build time and precached, so
 * they are the same page for everybody — and the actions behind them refuse anyway. This
 * is the sentence that turns a refusal into an explanation.
 *
 * Only ever rendered for someone with no role at all on this account (v3.1): the one role
 * left, admin, is exactly the one this notice is asking for, so there is no second case
 * where the reader already has it and this would need to say so.
 */
export function RoleNotice({ what }: { what: string }) {
  return (
    <p className="notice notice-accent" role="status">
      <IconInfo />
      <span>
        You need to be an <strong>admin</strong> on this account to {what}.
      </span>
    </p>
  )
}
