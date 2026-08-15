'use client'

import { useEffect, useState } from 'react'

/**
 * Three counters on the public page (v3.4): songbooks, songs, and songs played.
 * Placeholder numbers, not a real count — there is no query behind them yet — but
 * they still tick, on their own loose clocks, so the page reads as something alive
 * rather than three numbers pasted in once. Seeded to the exact values the first
 * server-rendered markup shows, so the client's first render matches it and nothing
 * has to reconcile a mismatch; the ticking itself only ever starts after mount.
 */

interface CounterState {
  books: number
  booksPrev: number | null
  songs: number
  songsPrev: number | null
  played: number
  playedPrev: number | null
}

const INITIAL: CounterState = {
  books: 486,
  booksPrev: null,
  songs: 3214,
  songsPrev: null,
  played: 128412,
  playedPrev: null,
}

/** One counter's own (base, jitter) delay in ms, so the three never step together. */
const CADENCE: Record<'books' | 'songs' | 'played', [base: number, jitter: number]> = {
  books: [19000, 14000],
  songs: [7000, 6000],
  played: [1800, 2800],
}

function DigitWindow({ value, prev }: { value: number; prev: number | null }) {
  const now = String(value).slice(-1)
  const before = prev === null ? null : String(prev).slice(-1)

  return (
    <span className="hero-counter-digit">
      {before !== null && (
        <span key={`out${prev}`} className="hero-counter-digit-out">
          {before}
        </span>
      )}
      <span key={`in${value}`} className="hero-counter-digit-in">
        {now}
      </span>
    </span>
  )
}

export function LandingCounters() {
  const [state, setState] = useState<CounterState>(INITIAL)

  useEffect(() => {
    const timeouts: number[] = []

    const tick = (key: 'books' | 'songs' | 'played') => {
      const [base, jitter] = CADENCE[key]
      const prevKey = `${key}Prev` as const
      const id = window.setTimeout(
        () => {
          setState((current) => ({ ...current, [key]: current[key] + 1, [prevKey]: current[key] }))
          tick(key)
        },
        base + Math.random() * jitter,
      )
      timeouts.push(id)
    }

    tick('books')
    tick('songs')
    tick('played')

    return () => timeouts.forEach((id) => window.clearTimeout(id))
  }, [])

  return (
    <div className="hero-counters">
      <Stat value={state.books} prev={state.booksPrev} label="songbooks" />
      <Stat value={state.songs} prev={state.songsPrev} label="songs" />
      <Stat value={state.played} prev={state.playedPrev} label="songs played" accent />
    </div>
  )
}

function Stat({
  value,
  prev,
  label,
  accent,
}: {
  value: number
  prev: number | null
  label: string
  accent?: boolean
}) {
  const head = value.toLocaleString('en-US').slice(0, -1)

  return (
    <div>
      <div className={accent ? 'hero-counter-value is-accent' : 'hero-counter-value'}>
        <span>{head}</span>
        <DigitWindow value={value} prev={prev} />
      </div>
      <p className="hero-counter-label">{label}</p>
    </div>
  )
}
