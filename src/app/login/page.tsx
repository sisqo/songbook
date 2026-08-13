import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import {
  IconBooks,
  IconBroadcast,
  IconChordShape,
  IconGoogle,
  IconImport,
  IconNote,
  IconOnStage,
  IconSliders,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import { APP_NAME, APP_PAYOFF } from '@/lib/brand'

const TITLE = `${APP_NAME} — ${APP_PAYOFF}`
const DESCRIPTION = 'Chords and lyrics you import, edit, export. Key, capo, auto-scroll. No network needed.'

export const metadata: Metadata = {
  // `absolute`, not the root template: this page names itself, and "· Songbook" after
  // its own payoff would repeat the name in the same breath.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, locale: 'en_US', type: 'website' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

interface Props {
  searchParams: Promise<{ error?: string; failed?: string }>
}

interface Feature {
  icon: React.ReactNode
  title: string
  text: string
}

/**
 * Eight, not an exhaustive list. Each is something a visitor can picture doing on
 * stage, in one sentence — the README says the rest, for whoever is already inside.
 */
const FEATURES: Feature[] = [
  {
    icon: <IconImport size={20} />,
    title: 'Bring your own songs',
    text: "No catalog, no starter library. Import what you already have, edit it your way, export it whenever you like — your repertoire stays yours.",
  },
  {
    icon: <IconOnStage size={20} />,
    title: 'Always with you, even offline',
    text: "Open it on your phone like any app. Once your repertoire is saved, it's there for good — anywhere you go, no signal required.",
  },
  {
    icon: <IconBooks size={20} />,
    title: 'As many songbooks as you want',
    text: "Create them freely, split each one into sections. Always the song you're after — never an endless list.",
  },
  {
    icon: <IconBroadcast size={20} />,
    title: 'Sing together',
    text: "Share a link. Every device follows the same song, line by line, chord by chord — whether you're playing or just singing along, near or far. Needs a connection, not a setup.",
  },
  {
    icon: <IconTuningFork size={20} />,
    title: 'Key and capo, made smart',
    text: 'Transpose with a tap, sing in your key. Then let the smart capo suggestion do the math: it finds the fret with the most open chords, so you play the easiest shapes — not just the right sound.',
  },
  {
    icon: <IconChordShape size={20} />,
    title: 'Every chord, one tap away',
    text: 'Stuck on a chord? Tap it and see the shape — guitar or ukulele, ready to play.',
  },
  {
    icon: <IconSliders size={20} />,
    title: 'Zoom and scroll',
    text: 'Bigger text, auto-scroll at your pace — readable in any condition, on any phone or tablet. Your hands stay on the instrument.',
  },
  {
    icon: <IconUsers size={20} />,
    title: 'Who does what',
    text: 'Admin, Editor or Viewer — choose who can play the songs, who can edit them, and who decides who gets in.',
  },
]

/**
 * The one screen anyone sees before signing in — which makes it the app's public page
 * too, and the only one: everything else redirects here without a session (see
 * `middleware.ts`). So it carries both jobs at once. The sign-in card stays exactly
 * where it was, right under the name, because the people here every day are not
 * visitors — they are reaching for the thing they came to do. The features are what
 * turn the same screen into an answer for the one visitor who is not: a warm wash, the
 * name, the payoff, and then what the app actually does, in sentences rather than a
 * feature list lifted from the README.
 *
 * Google first, because it is the way that needs no password kept anywhere. Underneath,
 * an address and a password, for whoever would rather not hand Google another sign-in —
 * or whose address is not a Google account at all.
 *
 * Both refusals are one sentence. "Wrong email or password" covers a wrong
 * password, an address with no password, and an address that is not on the list,
 * because telling those apart is telling a stranger which addresses exist here.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { error, failed } = await searchParams

  const message =
    failed !== undefined
      ? 'Wrong email or password.'
      : error === undefined
        ? null
        : error === 'AccessDenied'
          ? 'This account is not among the ones allowed in.'
          : 'Sign-in failed. Please try again.'

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <div className="w-full max-w-sm text-center">
        <span className="hero-mark">
          <span className="hero-mark-fill">
            <IconNote />
          </span>
        </span>

        <h1 className="landing-title mt-[18px] sm:mt-[22px]">{APP_NAME}</h1>
        {/*
          * Two short beats rather than the one clause `APP_PAYOFF` holds for the title
          * bar and the manifest: this is the one line on the screen that is heard, not
          * read for information, and it earns its own wording rather than borrowing theirs.
          */}
        <p className="landing-payoff mt-2 sm:mt-2.5">Your favorite songs. Ready to play.</p>
        <p className="mx-auto mt-3 max-w-[19rem] text-sm leading-[1.45] text-muted sm:mt-3.5 sm:max-w-lg sm:text-[15px] sm:leading-[1.5]">
          {DESCRIPTION}
        </p>
      </div>

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {message !== null && (
            <p className="notice notice-error text-start" role="alert">
              {message}
            </p>
          )}

          <form
            className={message !== null ? 'mt-4' : undefined}
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <button type="submit" className="btn is-page w-full justify-center py-3 text-base">
              <IconGoogle />
              Sign in with Google
            </button>
          </form>

          <div className="login-or">
            <span>or</span>
          </div>

          <form
            className="grid gap-2.5"
            action={async (data: FormData) => {
              'use server'

              try {
                await signIn('credentials', {
                  email: String(data.get('email') ?? ''),
                  password: String(data.get('password') ?? ''),
                  redirectTo: '/',
                })
              } catch (thrown) {
                /*
                 * `signIn` reports success by throwing a redirect, so the redirect has to
                 * pass through untouched — only a real `AuthError` means the attempt failed.
                 * It is answered with a flag in the URL rather than with the error's own
                 * code, because the code distinguishes cases this page must not.
                 */
                if (thrown instanceof AuthError) redirect('/login?failed=1')
                throw thrown
              }
            }}
          >
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="Email"
                className="form-field"
              />
            </label>

            <label className="block">
              <span className="sr-only">Password</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                className="form-field"
              />
            </label>

            <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3">
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          Access is limited to approved email addresses.
        </p>
      </div>

      <section className="mt-11 w-full max-w-4xl lg:mt-16">
        <div className="text-center">
          <h2 className="landing-feature-title">Built for playing, not scrolling.</h2>
          <p className="mx-auto mt-2 max-w-[26rem] text-sm leading-[1.45] text-muted lg:mt-2.5 lg:max-w-[30rem] lg:text-[15px] lg:leading-[1.5]">
            Every control is built for a thumb, not a mouse — for a hand already holding
            an instrument.
          </p>
        </div>

        <div className="feature-grid mt-6 lg:mt-8">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-head">
                <span className="feature-icon">{feature.icon}</span>
                <h3 className="feature-title">{feature.title}</h3>
              </div>
              <p className="feature-text">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
