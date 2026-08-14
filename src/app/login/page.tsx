import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import {
  IconBooks,
  IconBroadcast,
  IconChevronRight,
  IconChordShape,
  IconDevices,
  IconGoogle,
  IconImport,
  IconLeads,
  IconLink,
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

/** One of the three things `SingTogetherSpotlight` says about the feature below its own headline. */
interface SpotlightPoint {
  icon: React.ReactNode
  title: string
  text: string
}

const SING_TOGETHER_POINTS: SpotlightPoint[] = [
  {
    icon: <IconLeads size={18} />,
    title: 'One leader, no confusion',
    text: "Whoever's playing controls the song — line, section, chord — for everyone.",
  },
  {
    icon: <IconDevices size={18} />,
    title: 'Every screen, in sync',
    text: 'Each person reads clearly, on their own device, always on the same line.',
  },
  {
    icon: <IconLink size={18} />,
    title: 'Just a link away',
    text: 'No sign-up, no setup. Share a link, and anyone can join in seconds.',
  },
]

interface FaqItem {
  q: string
  a: string
}

interface FaqGroup {
  title: string
  items: FaqItem[]
}

const FAQ: FaqGroup[] = [
  {
    title: 'Bringing in your collection',
    items: [
      {
        q: 'Do I need to create my songs from scratch, or can I import what I already have?',
        a: "No catalog to start from — Songbook isn't a library you browse. You bring your own songs: import what you already have, and your collection is ready to go from day one.",
      },
      {
        q: 'What file formats can I import and export?',
        a: "Songbook uses ChordPro, the standard format for lyrics and chords. It's easy to import your existing files, edit them inside Songbook, and export them again whenever you need to.",
      },
      {
        q: "Can I edit a song after I've added it to my collection?",
        a: 'Yes, anytime. Lyrics, chords, key, capo — nothing is locked once a song is in your collection. Change it as often as you like, for as long as you use it.',
      },
      {
        q: 'Is there a limit to how many songs or songbooks I can create?',
        a: "No limit at all. Create as many songs and songbooks as your repertoire needs, whether that's a handful of favorites or hundreds of songs.",
      },
    ],
  },
  {
    title: 'Key, capo and chords',
    items: [
      {
        q: 'How does the smart capo suggestion work?',
        a: 'It checks every possible fret position and finds the one that lets you play the most open chords. That means you get the easiest shapes for your hands, not just a fret that happens to match the right sound.',
      },
      {
        q: 'Does it show chord shapes for both guitar and ukulele?',
        a: 'Yes. Tap any chord in a song and see exactly where to place your fingers, for either guitar or ukulele.',
      },
    ],
  },
  {
    title: 'Offline and devices',
    items: [
      {
        q: 'Do I need to install an app, or does it work in the browser?',
        a: 'Neither an app store nor an install step is required — just open Songbook on your phone like any regular app, straight from the browser.',
      },
      {
        q: 'What happens if I lose internet connection while playing?',
        a: 'Nothing changes. Once your repertoire is saved, it stays fully available on your device — no signal required, on stage or anywhere else.',
      },
      {
        q: 'Does my collection sync across my devices?',
        a: 'Yes. As soon as any of your devices is online, your whole collection syncs automatically — no manual backup or transfer needed.',
      },
    ],
  },
  {
    title: 'Sing Together',
    items: [
      {
        q: 'How many people can join a Sing Together session?',
        a: "As many as you like. Everyone who has the link can join and follow along, whether it's two friends or a whole room.",
      },
      {
        q: 'Does everyone need an account to join a session?',
        a: 'No sign-up and no setup required. Anyone with the link can join instantly and start singing along within seconds.',
      },
      {
        q: "Can I switch who's leading during a session?",
        a: 'No — the person who starts the session stays the leader for its whole duration, keeping control simple and unambiguous.',
      },
      {
        q: 'Does Sing Together work without an internet connection?',
        a: 'No. Since every device needs to stay in sync in real time, Sing Together requires an active internet connection to work.',
      },
    ],
  },
  {
    title: 'Accounts and access',
    items: [
      {
        q: 'Can I invite someone else to collaborate on my songbook?',
        a: "No — there's no shared songbook to invite anyone into. Every allowed address gets its own account and its own collection, kept separate from everyone else's. Letting a new address in at all is up to whoever administers the installation.",
      },
    ],
  },
  {
    title: 'General',
    items: [
      {
        q: 'Is Songbook free to use?',
        a: 'Yes, Songbook is completely free to use, with no hidden costs.',
      },
      {
        q: 'Is my collection private, or can others see it?',
        a: "Your collection is private by default, visible only to you — nobody else has access to an account that isn't theirs.",
      },
    ],
  },
]

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
    title: 'Your own space',
    text: "Every allowed address gets its own account and its own songbooks — nothing shared, nothing to manage on anyone else's behalf. An administrator decides who gets in; from there, it's yours alone.",
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

      {/*
        * Sing Together, raised above the feature tour below rather than folded into
        * it: it is the one thing on this page two people are doing at once, and the
        * first thing a visitor who is not signing in today should read. See
        * `.feature-spotlight`'s own comment in globals.css for why the fill is what
        * marks it out.
        */}
      <section className="mt-11 w-full max-w-2xl lg:mt-14">
        <div className="feature-spotlight">
          <span className="feature-spotlight-icon">
            <IconBroadcast size={26} />
          </span>

          <h2 className="feature-spotlight-title">Sing Together</h2>

          <p className="feature-spotlight-text">
            Passing a songbook around, or crowding over one phone — it gets old fast.
            With Sing Together, everyone follows the same song from their own device,
            automatically — whoever&apos;s playing, however many, and everyone who&apos;s
            singing along.
          </p>

          <div className="feature-spotlight-points">
            {SING_TOGETHER_POINTS.map((point) => (
              <div key={point.title}>
                <div className="feature-spotlight-point-head">
                  <span className="feature-spotlight-point-icon">{point.icon}</span>
                  <h3 className="feature-spotlight-point-title">{point.title}</h3>
                </div>
                <p className="feature-spotlight-point-text">{point.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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

      {/*
        * `<details>` per question rather than a client component with a piece of state
        * per row: nothing here needs JavaScript to show a paragraph of text once
        * tapped, and the browser already gives that focus, keyboard support, and a
        * screen reader's own sense of "expanded" for free — the same choice
        * `.editor-data` already makes for the song-data drawer elsewhere in the app.
        */}
      <section className="mt-11 w-full max-w-2xl lg:mt-16">
        <div className="text-center">
          <h2 className="landing-feature-title">Frequently asked questions</h2>
        </div>

        <div className="mt-6 space-y-7 lg:mt-8 lg:space-y-8">
          {FAQ.map((group) => (
            <div key={group.title}>
              <span className="group-label">{group.title}</span>

              <div className="card-stack mt-2.5">
                {group.items.map((item) => (
                  <details key={item.q} className="card faq-item">
                    <summary>
                      <IconChevronRight size={15} className="faq-arrow" />
                      <span>{item.q}</span>
                    </summary>
                    <p className="faq-answer">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
