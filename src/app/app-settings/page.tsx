import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AppSettingsForm } from '@/components/AppSettingsForm'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { loadSettingAuthor } from '@/lib/settings/actions'
import { loadNotifySettings } from '@/lib/settings/read'
import { NOTIFY_EVENTS, NOTIFY_LABEL } from '@/lib/settings/types'

export const metadata: Metadata = { title: 'App settings' }

/**
 * Per request, never prerendered — the same reason `/accounts` and `/emails` say so, one degree
 * sharper here: a settings panel built at deploy time would show whatever the switches said
 * then and go on showing it, which is precisely the "the screen says saved and nothing
 * changed" trap that `/pricing`'s build-time `CHECKOUT_LIVE` is a real instance of.
 */
export const dynamic = 'force-dynamic'

/**
 * Settings for the whole installation, as opposed to the reading preferences every reader has
 * of their own — those live in the user menu's own Settings, which is why this route is
 * `/app-settings` and not `/settings`: two things called Settings in the same header would be
 * a coin flip for whoever is looking for one of them.
 *
 * Only the four Telegram notification switches to begin with. What decides whether something
 * belongs here is not "is it configuration" but **"is it a secret"**: the bot token, the API
 * keys, the database URL and `ALLOWED_EMAILS` all stay in the environment, and none of them is
 * a candidate later either. A screen that can display a credential in order to edit it is a
 * screen that can leak one, and today nothing in this app can read those values back out at
 * all. `ALLOWED_EMAILS` has a second reason on top of that, in `allowlist.ts`' own words: kept
 * where the app cannot edit it, it makes locking yourself out impossible and keeps an owner in
 * even when the database is unreachable.
 *
 * `notFound()` rather than a role notice, like every other owner-only page here — "this does
 * not exist" and "this is not yours" should look identical from outside.
 */
export default async function AppSettingsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const { settings, available } = await loadNotifySettings()
  const authors = await Promise.all(NOTIFY_EVENTS.map((event) => loadSettingAuthor(event)))

  /* Only the switches somebody has actually touched have an author; the rest are untouched
     defaults, and saying "never changed" for each of them would be four lines of nothing. */
  const touched = NOTIFY_EVENTS.map((event, index) => ({ event, author: authors[index] })).filter(
    (entry) => entry.author !== null,
  )

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="app-settings" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">App settings</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Settings for the whole installation, not for your own reading. Tokens and keys are deliberately not here —
            they stay in the deployment&apos;s environment.
          </p>
        </header>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-1">Telegram notifications</h2>
          <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
            Which events send a message to the bot. Switching one off stops that message and nothing else.
          </p>

          <AppSettingsForm initial={settings} available={available} />
        </section>

        {touched.length > 0 && (
          <section className="card p-4">
            <h2 className="section-title mb-2.5">Last changed</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {touched.map(({ event, author }) => (
                <li key={event}>
                  {NOTIFY_LABEL[event]} — {author?.at.slice(0, 16).replace('T', ' ')}
                  {author?.by !== null && author?.by !== undefined ? ` by ${author.by}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
