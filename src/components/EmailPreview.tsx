'use client'

import { useState } from 'react'

import { sendTestEmail } from '@/lib/email/actions'
import { PREVIEW_KEYS, PREVIEW_LABEL } from '@/lib/email/preview'
import type { PreviewKey } from '@/lib/email/preview'
import type { EmailTemplate } from '@/lib/email/templates'
import { useOnline } from '@/lib/useOnline'

const FAILURE_MESSAGE: Record<'no-session' | 'not-owner', string> = {
  'no-session': 'Your session expired — sign in again.',
  'not-owner': 'Only a global owner can send a test email.',
}

/**
 * The tabbed viewer behind `/emails`: one template at a time, its subject, an HTML/plain-text
 * toggle, and a button that sends the real thing to whoever is signed in.
 *
 * The HTML goes into an `<iframe srcDoc>`, not straight into this page's DOM: those inline
 * styles are built for a mail client, not to sit next to Tailwind and this page's own resets
 * — and unlike the rest of this app, the frame is deliberately always light, because that is
 * what every inbox will actually show regardless of the reader's own theme.
 */
export function EmailPreview({ previews }: { previews: Record<PreviewKey, EmailTemplate> }) {
  const online = useOnline()
  const [active, setActive] = useState<PreviewKey>('verification')
  const [mode, setMode] = useState<'html' | 'text'>('html')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const template = previews[active]

  const select = (key: PreviewKey) => {
    setActive(key)
    setError(null)
    setDone(null)
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await sendTestEmail(active)
      if (result.ok) setDone('Sent — check your inbox.')
      else setError(FAILURE_MESSAGE[result.reason])
    } catch {
      setError('Could not send the test email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="segment mb-4 w-fit" role="tablist" aria-label="Email">
        {PREVIEW_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === active}
            className={key === active ? 'segment-button is-on px-4' : 'segment-button px-4'}
            onClick={() => select(key)}
          >
            {PREVIEW_LABEL[key]}
          </button>
        ))}
      </div>

      <p className="mb-3 text-sm text-muted">
        Subject: <span className="text-ink">{template.subject}</span>
      </p>

      <div className="segment mb-3 w-fit" role="group" aria-label="View as">
        <button
          type="button"
          className={mode === 'html' ? 'segment-button is-on px-4' : 'segment-button px-4'}
          aria-pressed={mode === 'html'}
          onClick={() => setMode('html')}
        >
          HTML
        </button>
        <button
          type="button"
          className={mode === 'text' ? 'segment-button is-on px-4' : 'segment-button px-4'}
          aria-pressed={mode === 'text'}
          onClick={() => setMode('text')}
        >
          Plain text
        </button>
      </div>

      {mode === 'html' ? (
        <iframe
          title={`${PREVIEW_LABEL[active]} preview`}
          srcDoc={template.html}
          className="h-[520px] w-full rounded-[var(--r-lg)] border border-line bg-white"
        />
      ) : (
        <pre className="h-[520px] overflow-auto whitespace-pre-wrap rounded-[var(--r-lg)] border border-line bg-nested p-3 text-sm text-ink">
          {template.text}
        </pre>
      )}

      {error && (
        <p className="notice notice-error mt-3" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mt-3" role="status">
          {done}
        </p>
      )}

      <button type="button" className="btn btn-primary btn-sm mt-3" disabled={!online || busy} onClick={() => void send()}>
        Send test copy to myself
      </button>
    </div>
  )
}
