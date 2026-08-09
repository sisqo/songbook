import type { Metadata } from 'next'

import { signIn } from '@/auth'

export const metadata: Metadata = { title: 'Accedi' }

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">songs</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        Testi e accordi. L&apos;accesso è riservato.
      </p>

      {error !== undefined && (
        <p
          className="mt-5 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="alert"
        >
          {error === 'AccessDenied'
            ? 'Questo account non è fra quelli autorizzati.'
            : 'Accesso non riuscito. Riprova.'}
        </p>
      )}

      <form
        className="mt-7"
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
      >
        <button
          type="submit"
          className="w-full rounded-xl border px-4 py-3 font-medium"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
        >
          Entra con Google
        </button>
      </form>
    </main>
  )
}
