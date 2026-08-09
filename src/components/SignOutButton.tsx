import { signOut } from '@/auth'

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/login' })
      }}
    >
      <button type="submit" className="text-sm underline-offset-2 hover:underline">
        Esci
      </button>
    </form>
  )
}
