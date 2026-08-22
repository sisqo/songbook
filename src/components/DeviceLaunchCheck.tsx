'use client'

import { useEffect, useState } from 'react'

import { LAUNCH_SCREENS, launchFileName, launchMedia } from '@/lib/launchScreens'
import type { LaunchScreen } from '@/lib/launchScreens'

/**
 * Whether *this* device has an iOS launch screen, answered by the same matcher iOS uses.
 *
 * It exists because of how the first attempt failed. The launch screens were shipped, verified in
 * production, and still showed a blank on a real iPhone — and there was no way to tell from here
 * which of the possible reasons it was, because the one thing that decides it is a media query
 * evaluated on the phone. `LAUNCH_SCREENS` is checked here with `window.matchMedia` against the
 * very strings `layout.tsx` puts in the `<link>` tags, so "no launch screen matches this device"
 * is not a guess about Apple's dimensions but the same question iOS asks, asked out loud.
 *
 * Kept rather than removed once that was solved: Apple ships new screen sizes every year, and
 * each one silently goes back to the blank. This is the line that says so, on the one screen only
 * an owner sees.
 *
 * Everything is read after mount, never during render: `window.matchMedia` and `screen` do not
 * exist on the server, and a value guessed for the first paint would be a value that could differ
 * from the truth a moment later.
 */
export function DeviceLaunchCheck() {
  const [device, setDevice] = useState<{ width: number; height: number; ratio: number } | null>(null)
  const [matched, setMatched] = useState<LaunchScreen[] | null>(null)
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setDevice({ width: window.screen.width, height: window.screen.height, ratio: window.devicePixelRatio })
    setMatched(LAUNCH_SCREENS.filter((screen) => window.matchMedia(launchMedia(screen)).matches))
    /* `display-mode: standalone` is true only for the app opened from the Home Screen — the one
       mode a launch screen is ever shown in, so a blank in Safari is not a fault to chase. */
    setStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  if (device === null || matched === null) {
    return <p className="text-sm text-muted">Reading this device…</p>
  }

  return (
    <div className="text-sm">
      <p className="text-muted">
        Screen <span className="font-mono text-ink">{device.width}</span> ×{' '}
        <span className="font-mono text-ink">{device.height}</span> at{' '}
        <span className="font-mono text-ink">{device.ratio}</span>× — opened{' '}
        {standalone ? 'from the Home Screen' : 'in a browser tab'}.
      </p>

      {matched.length > 0 ? (
        <p className="notice notice-success mt-2.5" role="status">
          A launch screen matches this device: <span className="font-mono">{launchFileName(matched[0])}</span>
          {matched.length > 1 && ` (and ${matched.length - 1} more, which should not happen)`}.
        </p>
      ) : (
        <p className="notice notice-error mt-2.5" role="status">
          <span>
            <strong>No launch screen matches this device</strong>, so iOS falls back to a blank one. Send the three
            numbers above to have it added — the media queries are matched exactly, never approximately.
          </span>
        </p>
      )}

      {!standalone && (
        <p className="mt-2 text-[0.8125rem] leading-[1.45] text-muted">
          A launch screen is only ever shown for the app added to the Home Screen, and only on a cold start. In a
          browser tab there is nothing to see either way.
        </p>
      )}
    </div>
  )
}
