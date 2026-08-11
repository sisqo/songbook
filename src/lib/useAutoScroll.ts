'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SCROLL_SPEEDS } from './prefs/types'

/** Minimal shape of the Wake Lock API, which is not in the bundled DOM types. */
interface WakeLockSentinel {
  released: boolean
  release(): Promise<void>
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}

/**
 * Auto-scroll at a constant speed.
 *
 * Two details matter more than the loop itself:
 *
 * - Fractional pixels are accumulated instead of passed to scrollBy, which
 *   truncates them. Without this the slowest speeds would round to zero and the
 *   page would not move at all.
 * - The screen is kept awake while scrolling. Without a wake lock the display
 *   sleeps halfway through the song, which makes the whole feature useless on
 *   stage. Where the API is missing it degrades silently.
 */
export function useAutoScroll(speedStep: number) {
  const [running, setRunning] = useState(false)
  const speedRef = useRef(speedStep)
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const remainderRef = useRef(0)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    speedRef.current = speedStep
  }, [speedStep])

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
  }, [])

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock
    if (!wakeLock) return
    try {
      wakeLockRef.current = await wakeLock.request('screen')
    } catch {
      // Denied, or unsupported in this context. Scrolling still works.
    }
  }, [])

  const stop = useCallback(() => {
    setRunning(false)
  }, [])

  const start = useCallback(() => {
    setRunning(true)
  }, [])

  const toggle = useCallback(() => {
    setRunning((current) => !current)
  }, [])

  useEffect(() => {
    if (!running) {
      releaseWakeLock()
      return
    }

    void requestWakeLock()
    lastTimeRef.current = performance.now()
    remainderRef.current = 0

    const step = (now: number) => {
      const elapsed = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      const wanted = SCROLL_SPEEDS[speedRef.current] * elapsed + remainderRef.current
      const whole = Math.floor(wanted)
      remainderRef.current = wanted - whole

      if (whole > 0) {
        const before = window.scrollY
        window.scrollBy(0, whole)

        // Nothing moved: we are at the bottom, so there is no point continuing.
        if (window.scrollY === before) {
          setRunning(false)
          return
        }
      }

      frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      releaseWakeLock()
    }
  }, [running, releaseWakeLock, requestWakeLock])

  /**
   * A manual gesture pauses, so correcting position by hand never fights the
   * animation. Only user-initiated events are watched — listening to `scroll`
   * would catch our own scrolling and stop immediately.
   *
   * Touches on the app's own fixed controls are not such a gesture. A tap fires
   * `touchstart` on window wherever it lands, so without this exclusion pressing
   * the speed buttons stopped the scroll instead of speeding it up, which is the
   * one thing those buttons exist to do while a song is playing.
   *
   * `wheel` is deliberately not excluded: a wheel anywhere, the control bar
   * included, really does scroll the page, so pausing is the right answer.
   */
  useEffect(() => {
    if (!running) return

    const fromControls = (target: EventTarget | null) =>
      target instanceof Element && target.closest('.control-bar, .top-bar') !== null

    const onWheel = () => setRunning(false)

    const onTouch = (event: TouchEvent) => {
      if (fromControls(event.target)) return
      setRunning(false)
    }

    const onKey = (event: KeyboardEvent) => {
      /*
       * A key pressed on one of our own controls is working that control, not
       * scrolling the page: space presses a button, and the arrows move the speed
       * slider — the one control on the bar meant to be touched mid-song. Pausing
       * on those would stop the scroll the key is there to adjust.
       */
      if (fromControls(event.target)) return

      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        setRunning(false)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('keydown', onKey)
    }
  }, [running])

  /** Wake locks are dropped when the page is hidden, so take it back on return. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && running && wakeLockRef.current === null) {
        void requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running, requestWakeLock])

  return { running, start, stop, toggle }
}
