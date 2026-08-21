import { PublicHeader } from '@/components/PublicHeader'

/**
 * Adds `PublicHeader` above `/pricing` without touching its own `<main>` — a layout of one
 * page rather than a route group, because there is only the one page here to share it with.
 * Its brand mark replaces the bespoke «← Songbook» link the page used to draw above its own
 * heading: a second way home directly under this bar would only repeat what it already says.
 */
export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  )
}
