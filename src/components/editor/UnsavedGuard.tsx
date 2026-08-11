'use client'

import { useEffect } from 'react'

/**
 * Asks before leaving the editor with work in it.
 *
 * `beforeunload` only covers leaving the site — closing the tab, reloading. Every
 * link in the header is a client-side navigation, which fires nothing at all: tapping
 * the hamburger with a half-written verse on screen threw it away silently. So the
 * clicks are caught here instead, on the way down and before any router sees them,
 * which covers the brand, the menu, the arrows and anything added to the header later.
 *
 * Forms are caught too, for the sign-out button — the one exit that is not a link.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return

    const ask = () => window.confirm('Ci sono modifiche non salvate. Uscire comunque?')

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return

      const target = event.target
      if (!(target instanceof Element)) return

      const link = target.closest('a[href]')
      if (link === null) return

      // Downloads and new tabs leave this page where it is.
      const href = link.getAttribute('href') ?? ''
      if (link.hasAttribute('download') || link.getAttribute('target') === '_blank') return
      if (href.startsWith('#')) return

      if (!ask()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const onSubmit = (event: SubmitEvent) => {
      if (!ask()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault()

    // Capturing, so the question is asked before the router acts on the click.
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [when])

  return null
}
