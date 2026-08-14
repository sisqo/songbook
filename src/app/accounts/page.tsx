import type { Metadata } from 'next'

import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { IconCheck } from '@/components/icons'
import { switchAccount } from '@/lib/accounts/actions'
import { listAllAccounts, listMyAccounts } from '@/lib/accounts/read'
import { currentUser } from '@/lib/auth/session'
import type { Role } from '@/lib/roles'

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and which is current, both depend on who is asking. */
export const dynamic = 'force-dynamic'

const ROLE_NAME: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

function EnterButton({ ownerEmail, isCurrent }: { ownerEmail: string; isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span className="meta-chip">
        <IconCheck size={13} /> current
      </span>
    )
  }

  const enter = async () => {
    'use server'
    await switchAccount(ownerEmail)
  }

  return (
    <form action={enter}>
      <button type="submit" className="btn btn-sm">
        Enter
      </button>
    </form>
  )
}

/**
 * Switching which account is current, and — for a global owner only — seeing every
 * account in the installation. Two different questions on one screen: `listMyAccounts`
 * answers the first for anyone, `listAllAccounts` the second only for a true owner — see
 * its own comment on why `asAdmin()` would have been the wrong check.
 */
export default async function AccountsPage() {
  const user = await currentUser()
  const [mine, all] = await Promise.all([listMyAccounts(), listAllAccounts()])

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Accounts</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Your own, and any account you collaborate on. Entering one changes what Home,
            Users and Sing Together show — until you switch again.
          </p>
        </header>

        <section>
          <h2 className="section-title">Yours</h2>

          {mine === null || mine.length === 0 ? (
            <p className="mt-2.5 text-sm text-muted">Could not read your accounts. Reload the page.</p>
          ) : (
            <ul className="card-stack mt-2.5">
              {mine.map((account) => (
                <li key={account.ownerEmail} className="card flex items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1 truncate">{account.ownerEmail}</span>
                  <span className="meta-chip">{ROLE_NAME[account.role]}</span>
                  <EnterButton
                    ownerEmail={account.ownerEmail}
                    isCurrent={user?.accountOwnerEmail === account.ownerEmail}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {all !== null && (
          <section className="mt-7">
            <h2 className="section-title">Every account</h2>
            <p className="mb-2.5 text-sm leading-[1.45] text-muted">
              Visible to owners only: every account in the installation, not just the ones
              you collaborate on.
            </p>

            <ul className="card-stack">
              {all.map((account) => (
                <li key={account.ownerEmail} className="card flex items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{account.ownerEmail}</span>
                    <span className="mt-0.5 block truncate text-[0.8125rem] text-faint">
                      {account.signInCount === 0
                        ? 'Never signed in'
                        : `${account.signInCount} sign-in${account.signInCount === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <EnterButton
                    ownerEmail={account.ownerEmail}
                    isCurrent={user?.accountOwnerEmail === account.ownerEmail}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </PrefsProvider>
  )
}
