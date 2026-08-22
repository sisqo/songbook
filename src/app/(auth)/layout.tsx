import { PublicHeader } from '@/components/PublicHeader'

/**
 * The shell shared by the four narrow sign-in-adjacent pages — register, forgot/reset
 * password, email verification — each a single `max-w-sm` card and nothing wider, which is
 * why they share one layout and one width where `/login` (the full landing page, 70rem) does
 * not: see that page's own `layout.tsx` for why it moved out of this group. 24rem, matching
 * the card every one of these four pages centers on its own.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* No mark in the bar: every page under here opens with `AuthLockup`'s own. */}
      <PublicHeader width="24rem" brand={false} />
      {children}
    </>
  )
}
