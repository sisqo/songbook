import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AccountPasswordButton } from '@/components/AccountPasswordButton'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { CreateAccountForm } from '@/components/CreateAccountForm'
import { DeleteAccountButton } from '@/components/DeleteAccountButton'
import { IconCheck } from '@/components/icons'
import { auth } from '@/auth'
import { switchAccount } from '@/lib/accounts/actions'
import { listAllAccounts } from '@/lib/accounts/read'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and which is current, both depend on who is asking. */
export const dynamic = 'force-dynamic'

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
 * Every account in the installation, and the only screen that can create or delete one —
 * a **global owner** question through and through, with a single public now (v3.1). The
 * old second audience, a collaborator switching between accounts they were invited into,
 * is gone along with collaboration itself: nobody has more than their own account to
 * switch to any more, so there is nothing left to show them here. `notFound()` rather
 * than a role notice, same reasoning as every other slug-reached page in this app —
 * "this does not exist" and "this is not yours" should look identical from outside.
 */
export default async function AccountsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const [user, all] = await Promise.all([currentUser(), listAllAccounts()])

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Accounts</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Every account in the installation. Entering one changes what Home and Sing
            Together show, until you switch again.
          </p>
        </header>

        <section className="mb-7">
          <h2 className="section-title">Create</h2>
          <p className="mb-2.5 text-sm leading-[1.45] text-muted">
            Gives an address its own account — with the Example songbook already inside —
            before it has ever signed in.
          </p>
          <CreateAccountForm />
        </section>

        <section>
          <h2 className="section-title">Every account</h2>

          {all === null ? (
            <p className="mt-2.5 text-sm text-muted">Could not read the accounts. Reload the page.</p>
          ) : (
            <ul className="card-stack mt-2.5">
              {all.map((account) => (
                <li
                  key={account.ownerEmail}
                  className="card flex flex-wrap items-center gap-3 px-4 py-3.5"
                >
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
                  <AccountPasswordButton ownerEmail={account.ownerEmail} />
                  <DeleteAccountButton ownerEmail={account.ownerEmail} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
