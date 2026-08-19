'use client'

import { useEffect, useLayoutEffect } from 'react'

import { readThemeChoice, showThemeChoice } from '@/lib/theme'

/*
 * Before the paint in the browser, and not at all on the server, where there is no
 * paint and React says so out loud. The rule this hook exists for is the one below:
 * arriving on the landing page must not show a frame of the reader's own theme
 * first.
 */
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * Holds the landing page in the light theme, whatever the reader's own is — see
 * `LIGHT_ONLY_PATH` for why that page has no say in it.
 *
 * The inline script in layout.tsx has already done this for anyone who loaded the
 * page. This is for the arrivals it cannot see: /register and /forgot-password link
 * back here through the router, and a client navigation runs no script in the
 * document head. It hands the theme back on the way out for the same reason —
 * those two pages are reached from here the same way.
 *
 * `showThemeChoice` rather than `applyThemeChoice`, in both directions: a theme
 * nobody asked for must not be remembered as one they did.
 */
export function LightThemeOnly() {
  useBeforePaint(() => {
    showThemeChoice('light')

    return () => showThemeChoice(readThemeChoice())
  }, [])

  return null
}
