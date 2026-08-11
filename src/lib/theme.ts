/**
 * Which theme is showing, and who decided.
 *
 * Device-local on purpose, and the one preference that is not synced. Zoom and
 * notation belong to the reader — the same person wants chords named the same way
 * everywhere — but a theme belongs to the screen it is read on: dark on the tablet
 * propped on an amp, light on the laptop at the kitchen table. Syncing it would
 * make one of those two devices wrong every time the other was used.
 *
 * So it lives under its own key rather than inside `songs:prefs`, which the queue
 * sends to the server.
 */

/** What the reader asked for. Not the same as which theme is showing: see `auto`. */
export type ThemeChoice = 'auto' | 'light' | 'dark'

export const THEME_KEY = 'songs:theme'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: 'Auto',
  light: 'Chiaro',
  dark: 'Scuro',
}

/**
 * The stored choice, or `auto` when there is none — which is also what a browser
 * that refuses storage reports, and the right answer there: with no attribute set,
 * the media query in globals.css decides, so the app still follows the system.
 */
export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
  } catch {
    // Private mode and disabled storage both throw. Following the system is fine.
    return 'auto'
  }
}

/**
 * Puts the choice on the page, and keeps it.
 *
 * `auto` removes the attribute rather than setting it to "auto": absent is what
 * hands the decision back to the media query, so a system that turns dark at
 * sunset is followed with no listener of ours involved.
 *
 * The twin of the first half of this lives as an inline script in layout.tsx,
 * where it has to run before the first paint and so cannot come from the bundle.
 * Change one and read the other.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement

  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice

  syncStatusBar(choice)

  try {
    if (choice === 'auto') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, choice)
  } catch {
    // The choice still applies to this page; it just will not outlive it.
  }
}

/** The id of the tag that overrides layout.tsx's media-scoped theme-color pair. */
export const STATUS_BAR_ID = 'theme-color-choice'

/**
 * Keeps the PWA status bar on the same colour as the page.
 *
 * layout.tsx declares two theme-color tags, one per system scheme, and a browser
 * uses the first whose media matches. A reader who forces light on a dark phone
 * would get the dark one, so an un-media'd tag goes in front of the pair — it
 * always matches, so it always wins — and comes back out when the choice is auto
 * and the pair is right again.
 *
 * The colour is read from the page rather than written here. --bg is already
 * declared in two places; a third copy in JavaScript is one nobody would think to
 * update.
 */
function syncStatusBar(choice: ThemeChoice): void {
  const existing = document.getElementById(STATUS_BAR_ID)

  if (choice === 'auto') {
    existing?.remove()
    return
  }

  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (background === '') return

  if (existing instanceof HTMLMetaElement) {
    existing.content = background
    return
  }

  const meta = document.createElement('meta')
  meta.id = STATUS_BAR_ID
  meta.name = 'theme-color'
  meta.content = background
  document.head.prepend(meta)
}
