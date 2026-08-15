'use client'

import { useEffect, useState } from 'react'

/**
 * Three counters on the public page (v3.4): songbooks, songs, and songs played.
 * Placeholder numbers, not a real count — there is no query behind them yet — but they
 * still climb, so the page reads as something alive rather than three numbers pasted in
 * once.
 *
 * Each value is a pure function of the wall clock, not of accumulated client-only state:
 * `base + elapsed-since-EPOCH / step`. A random `setTimeout`-driven +1 looked the same on
 * one visit, but reset to `base` on every reload — the number would visibly jump backward
 * the moment a visitor refreshed. Anchoring to real time instead means a reload always
 * shows the same value (or a little higher, if enough time passed), never a lower one.
 *
 * Server and client evaluate `Date.now()` moments apart, so the two renders can land on
 * different sides of a step boundary — the same situation React's own docs use
 * `suppressHydrationWarning` for (a rendered timestamp), not a bug to chase.
 */

interface CounterDef {
  key: 'books' | 'songs' | 'played'
  base: number
  /** How much real time passes per +1. */
  stepMs: number
  label: string
  accent?: boolean
}

/** The day this counter started climbing from `base`. */
const EPOCH_MS = Date.parse('2026-08-15T00:00:00Z')

const COUNTERS: CounterDef[] = [
  { key: 'books', base: 486, stepMs: 8 * 60 * 60 * 1000, label: 'songbooks created' },
  { key: 'songs', base: 3214, stepMs: 30 * 60 * 1000, label: 'songs created' },
  { key: 'played', base: 128412, stepMs: 15 * 1000, label: 'songs played', accent: true },
]

function valueAt(def: CounterDef, nowMs: number): number {
  return def.base + Math.floor((nowMs - EPOCH_MS) / def.stepMs)
}

function computeAll(nowMs: number): Record<CounterDef['key'], number> {
  return Object.fromEntries(COUNTERS.map((def) => [def.key, valueAt(def, nowMs)])) as Record<
    CounterDef['key'],
    number
  >
}

interface CounterState {
  value: number
  prev: number | null
}

function initialState(): Record<CounterDef['key'], CounterState> {
  const values = computeAll(Date.now())
  return Object.fromEntries(COUNTERS.map((def) => [def.key, { value: values[def.key], prev: null }])) as Record<
    CounterDef['key'],
    CounterState
  >
}

function DigitWindow({ value, prev }: { value: number; prev: number | null }) {
  const now = String(value).slice(-1)
  const before = prev === null ? null : String(prev).slice(-1)

  return (
    <span className="hero-counter-digit" suppressHydrationWarning>
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
  const [state, setState] = useState(initialState)

  useEffect(() => {
    // Checked every second rather than scheduled exactly on each counter's own step: the
    // clock can jump on its own (a backgrounded tab, a laptop waking up), and re-deriving
    // from `Date.now()` catches up in one step instead of drifting.
    const id = window.setInterval(() => {
      setState((current) => {
        const values = computeAll(Date.now())
        let changed = false
        const next = { ...current }

        for (const def of COUNTERS) {
          const value = values[def.key]
          if (value !== current[def.key].value) {
            changed = true
            next[def.key] = { value, prev: current[def.key].value }
          }
        }

        return changed ? next : current
      })
    }, 1000)

    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="hero-counters">
      {COUNTERS.map((def) => (
        <Stat key={def.key} state={state[def.key]} label={def.label} accent={def.accent} />
      ))}
    </div>
  )
}

function Stat({ state, label, accent }: { state: CounterState; label: string; accent?: boolean }) {
  const head = state.value.toLocaleString('en-US').slice(0, -1)

  return (
    <div>
      <div className={accent ? 'hero-counter-value is-accent' : 'hero-counter-value'}>
        <span suppressHydrationWarning>{head}</span>
        <DigitWindow value={state.value} prev={state.prev} />
      </div>
      <p className="hero-counter-label">{label}</p>
    </div>
  )
}
