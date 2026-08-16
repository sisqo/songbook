import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cookie Policy' }

const CONTACT = 'info@songbook.sisqo.dev'

export default function CookiePolicyPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="legal-updated">Last updated: 16 August 2026</p>

      <p>
        This Cookie Policy explains how Songbook uses cookies and similar technologies when you use
        the Service.
      </p>

      <h2>1. What are cookies</h2>
      <p>
        Cookies are small text files stored on your device by your browser. Similar technologies,
        such as local storage, work in comparable ways. They help websites and apps function properly
        and remember information about your visit.
      </p>

      <h2>2. What we use</h2>
      <p>
        <strong>Essential cookies and local storage.</strong> Used to keep you signed in, to maintain
        your session, and to store basic preferences such as your display settings. They are
        necessary for the Service to work and cannot be disabled without affecting core functionality.
      </p>
      <p>
        <strong>Google sign-in cookies — only if you choose that method.</strong> Signing in with an
        email and password sets none of these. If you choose to sign in with Google instead, Google
        sets its own cookies on your device as part of that sign-in flow, before you ever reach
        Songbook. Those cookies are set and controlled by Google under its own cookie and privacy
        policies, not by us.
      </p>
      <p>
        <strong>Aggregate analytics — without cookies.</strong> We use Vercel Web Analytics and Speed
        Insights to measure overall traffic and page performance. These tools{' '}
        <strong>do not set cookies</strong> and do not track you across other websites: visitors are
        identified by a temporary hash that is discarded within 24 hours, and only aggregated data is
        available to us. Because no information is stored on or read from your device for this
        purpose, no consent banner is required for it.
      </p>
      <p>
        <strong>No advertising or third-party tracking.</strong> Songbook does not use cookies for
        advertising, profiling, or third-party tracking of any kind, and does not share data with
        advertising networks.
      </p>

      <h2>3. Managing cookies</h2>
      <p>
        Essential cookies do not require consent, as they are strictly necessary to provide the
        Service you requested. If we ever introduce non-essential cookies, we will ask for your
        consent before placing them, and you will be able to withdraw it at any time.
      </p>
      <p>
        You can also manage or delete cookies through your browser settings. Note that disabling
        essential cookies may prevent Songbook from working correctly, including keeping you signed
        in.
      </p>

      <h2>4. Changes to this policy</h2>
      <p>
        We may update this Cookie Policy from time to time. Significant changes will be communicated
        through the app or by email.
      </p>

      <h2>5. Contact</h2>
      <p>
        For any question about this policy, contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
