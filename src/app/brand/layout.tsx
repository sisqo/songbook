import { PublicHeader } from '@/components/PublicHeader'

/**
 * Adds `PublicHeader` above `/brand` without touching its own `<main>` — the shape
 * `pricing/layout.tsx` and `login/layout.tsx` both take, for the same reason: one page, one
 * width, nothing to share it with.
 *
 * `brand={false}` more emphatically here than anywhere else it is passed. This page is
 * nothing but lockups shown at the size and on the ground each was drawn for; a twenty-first
 * one in the corner, at neither, would be the only unlabelled specimen on the screen. The way
 * back to `/` is the app's name in the opening sentence instead — written into the copy,
 * where a reader arriving from a search result will actually read it.
 */
export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 70rem, matching this page's own `<main className="... max-w-[70rem] ...">`. */}
      <PublicHeader width="70rem" brand={false} />
      {children}
    </>
  )
}
