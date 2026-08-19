import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import { Footer } from '@/components/Footer'
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
  IconPrint,
  IconSliders,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import { LandingCounters } from '@/components/LandingCounters'
import { APP_NAME, APP_PAYOFF } from '@/lib/brand'

const TITLE = `${APP_NAME} — ${APP_PAYOFF}`
const DESCRIPTION =
  'Play and sing with your own chords and lyrics — import, edit, export freely. Key, capo, auto-scroll, synced everywhere. Completely free.'

/** The three short facts in the hero's pill row — glanceable before anyone reads a word. */
interface HeroPill {
  icon: React.ReactNode
  text: string
}

const HERO_PILLS: HeroPill[] = [
  { icon: <IconImport size={14} />, text: 'Bring your own songs' },
  { icon: <IconOnStage size={14} />, text: 'Always with you, even offline' },
  { icon: <IconTuningFork size={14} />, text: 'Key and capo, made smart' },
]

export const metadata: Metadata = {
  // `absolute`, not the root template: this page names itself, and "· Songbook" after
  // its own payoff would repeat the name in the same breath.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, locale: 'en_US', type: 'website' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

interface Props {
  searchParams: Promise<{ error?: string; failed?: string; reset?: string }>
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
    title: 'Printing a booklet',
    items: [
      {
        q: 'Does the printed booklet use my own key and capo, or the song as written?',
        a: "The song as written. A booklet is meant to be printed and handed to other people, so it's typeset in each song's own key — not whatever transposition or capo you personally have set for reading, which wouldn't mean anything on somebody else's copy.",
      },
      {
        q: 'Can I print more than one songbook at a time?',
        a: "One PDF per songbook — pick which one from the Export screen and download it. If you keep separate songbooks for separate sets or bands, each one becomes its own booklet, complete with its own cover and index.",
      },
    ],
  },
  {
    title: 'Accounts and access',
    items: [
      {
        q: 'Can I invite someone else to collaborate on my songbook?',
        a: "No — there's no shared songbook to invite anyone into. Anyone can create their own account — with an email and password, or with Google — and gets their own collection, kept separate from everyone else's.",
      },
    ],
  },
  {
    title: 'General',
    items: [
      {
        q: 'Is Songbook free to use?',
        a: "Yes, Songbook is completely free to use, with no hidden costs. If it's earned a spot in your gig bag, the Ko-fi badge down in the footer is the closest thing this app has to a tip jar — entirely optional, always appreciated.",
      },
      {
        q: 'Is my collection private, or can others see it?',
        a: "Your collection is private by default, visible only to you — nobody else has access to an account that isn't theirs.",
      },
    ],
  },
]

/**
 * Nine, not an exhaustive list. Each is something a visitor can picture doing on
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
    icon: <IconPrint size={20} />,
    title: 'Print a real booklet',
    text: 'Turn any songbook into a typeset PDF — chords above the words, one song a page, a cover and an index — ready to print and hand out.',
  },
  {
    icon: <IconUsers size={20} />,
    title: 'Your own space',
    text: "Sign up with your email or with Google and get your own account and your own songbooks — nothing shared, nothing to manage on anyone else's behalf. From the moment you're in, it's yours alone.",
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
  const { error, failed, reset } = await searchParams

  const message =
    failed !== undefined
      ? 'Wrong email or password.'
      : error === undefined
        ? null
        : error === 'AccessDenied'
          ? "Google couldn't confirm this email address. Try again, or sign in a different way."
          : 'Sign-in failed. Please try again.'

  // Only shown when there is no failure to report instead — landing here with `?reset=1`
  // straight after `/reset-password` (v3.2, PLAN.md point 6) is never itself an error.
  const success = message === null && reset !== undefined ? 'Password changed. Sign in with your new password.' : null

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:px-8 sm:py-16 lg:px-12 xl:px-20">
      {/*
        * The hero, full-bleed: `self-stretch` rather than `w-full`, because a width of
        * 100% is measured inside `<main>`'s padding and a negative margin only shifts
        * a box that definite — the band stopped a gutter short of both edges. Stretched,
        * it is the padding box that the negative margins widen, at every breakpoint
        * `<main>`'s own padding changes, and the wash and the grain reach the viewport
        * edge. The inner wrapper then puts the gutter back for the badge, the headline,
        * the card and the counters — at the width every block below it shares.
        */}
      <section className="landing-hero -mx-5 -mt-10 self-stretch px-5 pb-10 pt-10 sm:-mx-8 sm:-mt-16 sm:px-8 sm:pb-14 sm:pt-14 lg:-mx-12 lg:px-12 lg:pb-16 lg:pt-16 xl:-mx-20 xl:px-20">
        <div className="landing-hero-decor" aria-hidden />
        <div className="landing-hero-grain" aria-hidden />

        <div className="landing-hero-grid landing-width">
          <span className="hero-badge">
            <span className="hero-badge-icon">
              <IconNote />
            </span>
            {APP_NAME}
          </span>

          {/*
            * Two short beats rather than the one clause `APP_PAYOFF` holds for the title
            * bar and the manifest: this is the one line on the screen that is heard, not
            * read for information, and it earns its own wording rather than borrowing theirs.
            */}
          <h1 className="landing-hero-title">
            Your favorite songs.
            <br />
            <span className="text-accent">Ready to play.</span>
          </h1>

          <p className="landing-hero-lede">{DESCRIPTION}</p>

          <div className="hero-pills">
            {HERO_PILLS.map((pill) => (
              <span key={pill.text} className="hero-pill">
                {pill.icon}
                {pill.text}
              </span>
            ))}
          </div>

          <div className="landing-hero-card">
            <div className="card card-lead login-card p-6 sm:p-7">
              {message !== null && (
                <p className="notice notice-error text-start" role="alert">
                  {message}
                </p>
              )}

              {success !== null && (
                <p className="notice notice-accent text-start" role="status">
                  {success}
                </p>
              )}

              <form
                className={message !== null || success !== null ? 'mt-4' : undefined}
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
                  <span className="mt-1.5 block text-end">
                    <Link href="/forgot-password" className="text-xs text-muted hover:underline">
                      Forgot password?
                    </Link>
                  </span>
                </label>

                <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3">
                  Sign in
                </button>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-muted">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-accent hover:underline">
                Register
              </Link>
            </p>
          </div>

          <LandingCounters />
        </div>
      </section>

      {/*
        * Sing Together, raised above the feature tour below rather than folded into
        * it: it is the one thing on this page two people are doing at once, and the
        * first thing a visitor who is not signing in today should read. See
        * `.feature-spotlight`'s own comment in globals.css for why the fill is what
        * marks it out.
        */}
      <section className="landing-width mt-11 lg:mt-14">
        <div className="feature-spotlight">
          <svg
            className="feature-spotlight-mark"
            width="300"
            height="300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.6}
            aria-hidden="true"
          >
            <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
            <path d="M8.5 19a3.5 3.5 0 0 1 7 0" />
            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
          </svg>

          <div className="feature-spotlight-inner">
            <div>
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
            </div>

            <div className="feature-spotlight-points">
              {SING_TOGETHER_POINTS.map((point) => (
                <div key={point.title} className="feature-spotlight-point">
                  <span className="feature-spotlight-point-icon">{point.icon}</span>
                  <div>
                    <h3 className="feature-spotlight-point-title">{point.title}</h3>
                    <p className="feature-spotlight-point-text">{point.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-width mt-11 lg:mt-16">
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

      <Footer />
    </main>
  )
}
