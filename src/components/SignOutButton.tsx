import { signOut } from '@/auth'

import { IconExit } from '@/components/icons'

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/login' })
      }}
    >
      <button type="submit" className="nav-link" title="Esci">
        <IconExit />
        <span className="sr-only">Esci</span>
      </button>
    </form>
  )
}
