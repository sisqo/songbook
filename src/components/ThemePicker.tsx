'use client'

import { useState } from 'react'

import { type ThemeChoice, THEME_LABEL, applyThemeChoice, readThemeChoice } from '@/lib/theme'

const CHOICES: ThemeChoice[] = ['auto', 'light', 'dark']

/**
 * Light or dark, or whatever the system says.
 *
 * Three states rather than two, and Auto is the default: the app followed the
 * system before this control existed, and a tablet that turns dark when the room
 * does is worth keeping. The switch the reader asked for is here — Light and
 * Dark — with the old behaviour still reachable rather than quietly dropped.
 *
 * The stored value is read in the initial state, not in an effect, and that is
 * safe here for one reason: this lives inside the menu panel, which the server
 * never renders — it exists only after the reader has opened the menu, long past
 * hydration. Read during a render the server also did, it would mismatch.
 */
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice)

  return (
    <div className="px-1.5 pb-1 pt-2">
      <span className="group-label mb-1.5">Theme</span>

      {/*
        * The same segmented control as the reading panel, stretched to the width of
        * the menu: three words do not fit beside a label in a panel this narrow, and
        * a sun and a moon would leave "auto" as a shape nobody can name.
        */}
      <span className="segment w-full" role="group" aria-label="App theme">
        {CHOICES.map((entry) => (
          <button
            key={entry}
            type="button"
            className={entry === choice ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
            aria-pressed={entry === choice}
            onClick={() => {
              setChoice(entry)
              applyThemeChoice(entry)
            }}
          >
            {THEME_LABEL[entry]}
          </button>
        ))}
      </span>
    </div>
  )
}
