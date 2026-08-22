import { APP_NAME } from '@/lib/brand'

/**
 * The masthead every page under `(auth)` opens with: the vertical lockup, and the one
 * line that says which of them you are on.
 *
 * One component rather than the same block copied into four pages, which is what it
 * was — a circular badge holding `IconNote` with `{APP_NAME}` printed underneath it,
 * a vertical lockup composed by hand for want of a drawn one, kept in step across four
 * files by hand. The drawn one arrived with the 2026-08-22 brand assets, and one image
 * replaces the badge, the wordmark and the gap between them.
 *
 * The lockup *is* the `<h1>`: it is what these pages are headed by, and the wordmark
 * lives inside the image rather than beside it, so `alt` is the only way the name
 * reaches a screen reader — an `<h1>` whose only content is an unlabelled image is a
 * page with no heading at all. Both themes' files are in the markup and CSS shows one
 * (`img.lockup-light`/`.lockup-dark`, same reason as `TopBar`); a `display: none`
 * image is out of the accessibility tree, so the name is announced once, not twice.
 */
export function AuthLockup({ payoff }: { payoff: string }) {
  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="auth-lockup">
        {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
        <img src="/brand/lockup-vertical-black.svg" alt={APP_NAME} className="lockup-light" />
        {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
        <img src="/brand/lockup-vertical-white.svg" alt={APP_NAME} className="lockup-dark" />
      </h1>

      {/*
        * A hair more air than the `mt-2 sm:mt-2.5` this line sat on under the live-text
        * wordmark, and the same gap on the screen: the lockup's `viewBox` is cropped to
        * its own ink, where a line of text carried a few pixels of its own leading below
        * the baseline. Matching the numbers would have closed the gap by that much.
        */}
      <p className="landing-payoff mt-3 sm:mt-4">{payoff}</p>
    </div>
  )
}
