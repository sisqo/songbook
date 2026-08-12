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
      <button type="submit" className="menu-item w-full" role="menuitem">
        <IconExit size={17} />
        Sign out
      </button>
    </form>
  )
}
