'use client'

import { useEffect, useRef, useState } from 'react'

import { IconCheck, IconCopy } from '@/components/icons'

type State = 'idle' | 'copied' | 'failed'

/**
 * Copies one asset's URL to the clipboard — the whole reason `/brand` exists as a page
 * rather than as a folder of files: what you want from a brand kit is almost never the
 * file, it is the link to hand to whatever asked for a logo.
 *
 * The URL it copies is absolute (`https://…`), not the `/brand/kit/…` path the page's
 * own links use: a relative path is right for a link within the site and useless the
 * moment it is pasted into a store listing, an email signature or somebody else's CSS.
 * It is built from `SITE_URL`, so the button copies the production URL even when the
 * page is being read on localhost — the copy is for elsewhere, and elsewhere cannot
 * reach a dev server.
 *
 * `label` prints "Copy URL" next to the icon; without it the button is the icon alone,
 * which is what the long file list uses, where a hundred and forty buttons each saying
 * "Copy URL" would be a column of the same two words. Either way `aria-label` names the
 * file, because "Copy" repeated a hundred and forty times down a screen reader's list
 * of buttons is no list at all.
 */
export function CopyUrl({ url, name, label = false }: { url: string; name: string; label?: boolean }) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  /* A row can be unmounted while its "Copied" is still showing — the timer has to go with it. */
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    clearTimeout(timer.current)

    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      /*
       * Clipboard access can be refused outright (an insecure origin, a permission
       * policy). Saying so is better than a button that looks like it worked: the URL
       * is on the screen next to it either way, so there is always a way to get it.
       */
      setState('failed')
    }

    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      className="btn btn-sm asset-copy"
      onClick={() => void copy()}
      /*
       * The name stays put and the live region below reports the outcome. Swapping the
       * label to "copied" as well would have the same button announced twice, once as a
       * renamed control and once as a status.
       *
       * "Copy URL" first, word for word, because that is what the button says when it
       * says anything: a name that reads "Copy the URL of…" would not contain its own
       * visible label, and somebody driving this page by voice would say "click Copy
       * URL" and hit nothing (WCAG 2.5.3).
       */
      aria-label={`Copy URL of ${name}`}
    >
      {state === 'copied' ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {label ? <span>{copyLabel(state)}</span> : null}
      {/* Announced whether or not the label is drawn, so an icon-only button still reports back. */}
      <span className="sr-only" role="status">
        {state === 'idle' ? '' : copyLabel(state)}
      </span>
    </button>
  )
}

function copyLabel(state: State): string {
  if (state === 'copied') return 'Copied'
  if (state === 'failed') return 'Copy failed'
  return 'Copy URL'
}
