/**
 * The iOS launch screens — the branded frame the system shows while the web view boots, before
 * a single line of this app has run.
 *
 * Why these exist at all: `manifest.ts` sets `background_color`, and on Android that is enough —
 * the system draws a splash from it and the icon for free. iOS ignores it, and shows plain white
 * (or nothing) instead, unless it is handed an `apple-touch-startup-image` whose media query
 * matches the device exactly. So this is not a splash we are *adding* to the launch; it is the
 * blank we are filling in, and it costs nothing at runtime because iOS paints it during the boot
 * it was already doing.
 *
 * **One list, two readers.** `scripts/launch-screens.ts` generates a PNG per entry and
 * `app/layout.tsx` emits a `<link>` per entry, both from here. Kept together because the failure
 * mode of two lists is silent: a device would get a `<link>` pointing at a file nobody generated,
 * or a generated file no `<link>` names — and either way iOS falls back to the blank, which looks
 * exactly like not having done any of this. `launchScreens.test.ts` checks the files on disk
 * against this array for the same reason.
 *
 * **Portrait only**, deliberately, and it is a real gap rather than an oversight: a landscape
 * cold start still gets the blank. Covering it means a second entry per device and doubling the
 * assets, and phones are launched from the home screen in portrait nearly always. Adding
 * landscape later is one more field in this array plus a re-run of the script — the iPad case is
 * the one that would justify it, with the tablet on a music stand.
 *
 * Dark only, matching `background_color` rather than following the reader's theme: the launch
 * screen is painted before anything can know what theme they chose, and Android's own splash is
 * already this colour unconditionally. A light launch that handed over to a dark app would flash
 * worse than a dark one that handed over to a light app.
 */

export interface LaunchScreen {
  /** CSS pixels, as iOS reports them in `device-width`. */
  width: number
  /** CSS pixels, as iOS reports them in `device-height`. */
  height: number
  /** `-webkit-device-pixel-ratio`. */
  ratio: number
  /** Which devices this row is for — a comment for whoever reads the list, never rendered. */
  devices: string
}

/**
 * The background every launch screen is filled with: `manifest.ts`' own `background_color`,
 * repeated as a literal rather than imported from it, because that file exports a function
 * returning a whole manifest object and this needs one string out of it. The two must agree —
 * an Android splash and an iOS launch screen in different colours on the same phone model would
 * be the kind of difference nobody can explain.
 */
export const LAUNCH_BACKGROUND = '#101216'

export const LAUNCH_SCREENS: LaunchScreen[] = [
  { width: 375, height: 667, ratio: 2, devices: 'iPhone SE (2nd/3rd), 8, 7, 6s' },
  { width: 375, height: 812, ratio: 3, devices: 'iPhone X, XS, 11 Pro, 12 mini, 13 mini' },
  { width: 390, height: 844, ratio: 3, devices: 'iPhone 12, 13, 14, 16e' },
  { width: 393, height: 852, ratio: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { width: 402, height: 874, ratio: 3, devices: 'iPhone 16 Pro' },
  { width: 414, height: 896, ratio: 2, devices: 'iPhone XR, 11' },
  { width: 414, height: 896, ratio: 3, devices: 'iPhone XS Max, 11 Pro Max' },
  { width: 428, height: 926, ratio: 3, devices: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus' },
  { width: 430, height: 932, ratio: 3, devices: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
  { width: 440, height: 956, ratio: 3, devices: 'iPhone 16 Pro Max' },
  { width: 768, height: 1024, ratio: 2, devices: 'iPad 9.7"' },
  { width: 810, height: 1080, ratio: 2, devices: 'iPad 10.2"' },
  { width: 820, height: 1180, ratio: 2, devices: 'iPad Air 10.9", iPad 11"' },
  { width: 834, height: 1112, ratio: 2, devices: 'iPad Pro 10.5"' },
  { width: 834, height: 1194, ratio: 2, devices: 'iPad Pro 11"' },
  { width: 1024, height: 1366, ratio: 2, devices: 'iPad Pro 12.9", 13"' },
]

/** Device pixels, which is what the PNG is actually sized in. */
export function launchPixels(screen: LaunchScreen): { width: number; height: number } {
  return { width: screen.width * screen.ratio, height: screen.height * screen.ratio }
}

/**
 * Named by device pixels rather than by device: two rows can share a CSS size and differ only in
 * their ratio (iPhone XR and XS Max are both 414×896), so a name built from the CSS size would
 * collide and one image would overwrite the other.
 */
export function launchFileName(screen: LaunchScreen): string {
  const { width, height } = launchPixels(screen)
  return `apple-launch-${width}x${height}.png`
}

export function launchUrl(screen: LaunchScreen): string {
  return `/brand/launch/${launchFileName(screen)}`
}

/** The media query iOS matches against. All four clauses are required for it to match at all. */
export function launchMedia(screen: LaunchScreen): string {
  return (
    `(device-width: ${screen.width}px) and (device-height: ${screen.height}px)` +
    ` and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`
  )
}
