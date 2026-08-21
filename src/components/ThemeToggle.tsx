'use client'

import { useEffect, useLayoutEffect, useState } from 'react'

import { IconMoon, IconSun, IconThemeAuto } from '@/components/icons'
import { THEME_LABEL, applyThemeChoice, readThemeChoice } from '@/lib/theme'
import type { ThemeChoice } from '@/lib/theme'

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' }

const ICON: Record<ThemeChoice, typeof IconSun> = {
  auto: IconThemeAuto,
  light: IconSun,
  dark: IconMoon,
}

/*
 * Before the paint, on the client only — the same trick `LightThemeOnly` used to take for
 * the same reason: an effect that ran after the browser had already painted would show its
 * one correction as a visible flash, and a layout effect run before that paint does not.
 */
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * The theme switch, as one symbol rather than `ThemePicker`'s three-word segmented control —
 * that one still lives in Settings for a reader who wants every option named at once; this is
 * the version that fits in a header, on every screen the app draws, signed in or not:
 * `TopBar` for the ones behind a session, `PublicHeader` for the ones in front of it. One
 * component either way, so the icon, the cycle order and the label agree everywhere rather
 * than three places that could drift.
 *
 * Cycles auto → light → dark → auto on tap, never a menu: a single glyph that already
 * announces the next state in its `aria-label` needs nowhere to open.
 *
 * Starts drawn as `auto`, then corrects itself in a layout effect rather than in the initial
 * `useState` — the opposite of `ThemePicker`'s own choice, and deliberately so. `ThemePicker`
 * lives inside a menu panel the server never renders, long past hydration by the time it
 * mounts; this renders on the very first paint, server included, where there is no
 * `localStorage` for `readThemeChoice` to read. Seeding the initial state with it would read
 * `auto` on the server and whatever is actually stored on the client's first pass — a
 * mismatch React would warn about, and the visible symptom would be the wrong icon showing
 * for the one frame before hydration catches it. Starting at the value the server also drew
 * and fixing it before that frame paints avoids both.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('auto')

  useBeforePaint(() => {
    setChoice(readThemeChoice())
  }, [])

  const next = NEXT[choice]
  const Icon = ICON[choice]

  return (
    <button
      type="button"
      className="nav-link"
      aria-label={`Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[next]}.`}
      title={`Theme: ${THEME_LABEL[choice]}`}
      onClick={() => {
        setChoice(next)
        applyThemeChoice(next)
      }}
    >
      <Icon size={17} />
    </button>
  )
}
