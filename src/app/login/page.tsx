import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import {
  IconBooks,
  IconChordShape,
  IconGoogle,
  IconNote,
  IconOnStage,
  IconSliders,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import { APP_NAME, APP_PAYOFF } from '@/lib/brand'

const TITLE = `${APP_NAME} — ${APP_PAYOFF}`
const DESCRIPTION =
  'Testi e accordi del repertorio, in notazione italiana o internazionale, con tonalità, capotasto e scorrimento automatico — pronti per il palco, anche senza rete.'

export const metadata: Metadata = {
  // `absolute`, not the root template: this page names itself, and "· Songbook" after
  // its own payoff would repeat the name in the same breath.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, locale: 'it_IT', type: 'website' },
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
 * Six, not an exhaustive list. Each is something a visitor can picture doing on
 * stage, in one sentence — the README says the rest, for whoever is already inside.
 */
const FEATURES: Feature[] = [
  {
    icon: <IconBooks size={20} />,
    title: 'Canzonieri e sezioni',
    text: 'Il repertorio si divide in canzonieri, e ogni canzoniere in sezioni che si aprono e chiudono al bisogno: sempre il brano che serve, non un elenco infinito.',
  },
  {
    icon: <IconTuningFork size={20} />,
    title: 'Tonalità e capotasto',
    text: 'Trasponi con un tocco per cantare nella tonalità giusta. Il capotasto mostra le forme da fare, non quelle che suonano, e suggerisce il tasto con più accordi aperti.',
  },
  {
    icon: <IconChordShape size={20} />,
    title: 'La forma di ogni accordo',
    text: 'Ogni accordo sullo spartito è un bottone: un tocco apre la sua forma per chitarra o ukulele, pronta da suonare.',
  },
  {
    icon: <IconSliders size={20} />,
    title: 'Zoom e scorrimento automatico',
    text: 'Ingrandisci il testo e lascialo scorrere da solo, alla velocità che preferisci: le mani restano sullo strumento.',
  },
  {
    icon: <IconOnStage size={20} />,
    title: 'Sempre con te, anche offline',
    text: 'Installala sul telefono: una volta pubblicato, il repertorio resta leggibile anche sul palco, senza una rete.',
  },
  {
    icon: <IconUsers size={20} />,
    title: 'Ruoli su misura',
    text: 'Admin, Editor o Viewer: decidi chi può leggere, chi può modificare il repertorio e chi gestisce chi entra.',
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
 * Both refusals are one sentence. "Email o password non corretti" covers a wrong
 * password, an address with no password, and an address that is not on the list,
 * because telling those apart is telling a stranger which addresses exist here.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { error, failed } = await searchParams

  const message =
    failed !== undefined
      ? 'Email o password non corretti.'
      : error === undefined
        ? null
        : error === 'AccessDenied'
          ? 'Questo account non è fra quelli autorizzati.'
          : 'Accesso non riuscito. Riprova.'

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <div className="w-full max-w-sm text-center">
        <span className="login-mark">
          <IconNote size={28} />
        </span>

        <h1 className="landing-title mt-5">{APP_NAME}</h1>
        <p className="landing-payoff mt-2">{APP_PAYOFF}</p>
        <p className="mx-auto mt-3 max-w-[19rem] text-sm leading-[1.45] text-muted">
          {DESCRIPTION}
        </p>
      </div>

      <div className="mt-9 w-full max-w-sm">
        <div className="card p-7">
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
            <button type="submit" className="btn w-full justify-center py-3 text-base">
              <IconGoogle />
              Entra con Google
            </button>
          </form>

          <div className="login-or">
            <span>oppure</span>
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
              <span className="field-label">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="form-field"
              />
            </label>

            <label className="block">
              <span className="field-label">Password</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="form-field"
              />
            </label>

            <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3">
              Entra
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          L&apos;accesso è riservato agli indirizzi autorizzati.
        </p>
      </div>

      <section className="mt-16 w-full max-w-4xl sm:mt-20">
        <div className="text-center">
          <h2 className="section-title">Fatta per il palco, non per il divano</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-[1.45] text-muted">
            Ogni controllo è pensato per un pollice, non per un mouse — e per una mano che
            in quel momento sta tenendo uno strumento.
          </p>
        </div>

        <div className="feature-grid mt-8">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-card">
              <span className="feature-icon">{feature.icon}</span>
              <h3 className="mt-3.5 font-medium">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-[1.45] text-muted">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
