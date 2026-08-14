import Link from 'next/link'

import { NavMenu } from '@/components/NavMenu'
import { SignOutButton } from '@/components/SignOutButton'
import { IconChevronLeft, IconChevronRight, IconNote } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'

export type Section = 'songs' | 'songbooks' | 'password' | 'accounts'

/**
 * The header, on every screen inside the app.
 *
 * The sections live in a menu rather than in the bar itself: five labels never
 * fit a phone — the first version proved it by cutting "Sign out" off the right edge
 * — and icons alone said too little.
 *
 * The brand is on every screen, including inside a song. It used to be swapped
 * out for the return link there, which saved a few millimetres and cost the one
 * thing that says which app this is — on a phone, in standalone mode, with no
 * browser chrome around it. So `back` is now something the bar gains rather than
 * something that displaces the mark, and it is only worth passing when it leads
 * somewhere the brand does not: from inside a song, the songbook it came from,
 * which is one level below the home the brand leads to.
 *
 * The active section arrives as a prop rather than from `usePathname`, so the
 * server renders it: these pages are statically generated and precached, and
 * nothing here should be able to change that.
 */
export function TopBar({
  current,
  back,
  steps,
}: {
  current: Section
  /** A second way out, next to the brand. Leave unset when it would lead home too. */
  back?: { href: string; label: string }
  /** Previous and next song, when this screen is part of a sequence. */
  steps?: { previous: string | null; next: string | null }
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        <Link href="/" className="brand" aria-label={`${APP_NAME}, all songs`}>
          <span className="brand-mark">
            <IconNote size={15} />
          </span>
          <span>{APP_NAME}</span>
        </Link>

        {back !== undefined && (
          <Link href={back.href} className="back-link min-w-0">
            <IconChevronLeft size={16} />
            <span className="truncate">{back.label}</span>
          </Link>
        )}

        <span className="flex-1" />

        {/*
         * Both arrows keep their place even with nowhere to go, so the buttons
         * next to them do not shift between the first song and the second.
         */}
        {steps !== undefined && (
          <div className="flex items-center gap-1.5">
            <Step href={steps.previous} label="Previous song" direction="previous" />
            <Step href={steps.next} label="Next song" direction="next" />
          </div>
        )}

        <NavMenu current={current}>
          <SignOutButton />
        </NavMenu>
      </div>
    </header>
  )
}

function Step({
  href,
  label,
  direction,
}: {
  href: string | null
  label: string
  direction: 'previous' | 'next'
}) {
  const icon = direction === 'previous' ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />

  if (href === null) {
    return (
      <span className="nav-link is-off" aria-hidden>
        {icon}
      </span>
    )
  }

  return (
    <Link href={href} className="nav-link" title={label} aria-label={label}>
      {icon}
    </Link>
  )
}
