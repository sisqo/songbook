import { PublicHeader } from '@/components/PublicHeader'

/**
 * The shell shared by every sign-in-adjacent page — login, register, forgot/reset password,
 * email verification — the same reasoning `(legal)/layout.tsx` already applies to its own
 * four pages, and a route group rather than a fifth hand-written `<PublicHeader />` (this
 * group's route segment is invisible in the URL, so `/login` still means `/login`).
 *
 * `PublicHeader` and nothing else: each page below still draws its own hero mark, card and
 * `Footer`, exactly as it did before this group existed. This adds only the bar above them —
 * the brand mark as the way home, and the one control every page needs regardless of who is
 * reading it, the theme switch — where previously there was none.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  )
}
