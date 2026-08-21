import { PublicHeader } from '@/components/PublicHeader'

/**
 * Adds `PublicHeader` above `/login` without touching its own `<main>` — a layout of one
 * page, the same shape `pricing/layout.tsx` takes for the same reason. `/login` used to sit
 * in the `(auth)` group with the four narrower sign-in-adjacent pages, and moved out of it
 * once that group needed one shared width and this page's own is a different number:
 * `/login` is the full landing page, 70rem wide (`.landing-width`) like `/pricing`, where
 * `/register` and the rest are a single 24rem card.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader width="70rem" />
      {children}
    </>
  )
}
