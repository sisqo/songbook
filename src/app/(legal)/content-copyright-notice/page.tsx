import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Content & Copyright Notice' }

const CONTACT = 'info@songbook.sisqo.dev'

export default function ContentCopyrightNoticePage() {
  return (
    <>
      <h1>Content &amp; Copyright Notice</h1>
      <p className="legal-updated">Last updated: 15 August 2026</p>

      <p>
        Songbook (songbook.sisqo.dev) is a free, non-commercial project — a tool for managing your own
        personal song collection. This notice clarifies how content and copyright work within the
        Service.
      </p>

      <h2>1. No built-in song library</h2>
      <p>
        <strong>Songbook does not contain any song lyrics or chord charts of its own.</strong> There
        is no catalog, library, or pre-loaded content of any kind — the Service ships empty. Every
        song that appears in your collection is content that you have personally typed in or imported
        from a file on your own device.
      </p>
      <p>
        The Service does not search the web, scrape third-party sites, or fetch content from external
        sources on your behalf. Nothing enters your collection unless you put it there.
      </p>

      <h2>2. Your responsibility</h2>
      <p>
        You are solely responsible for ensuring that any lyrics, chords, or other material you import
        into Songbook:
      </p>
      <ul>
        <li>is your own original work, or</li>
        <li>is in the public domain, or</li>
        <li>you otherwise hold the rights, license, or permission necessary to store and use it.</li>
      </ul>
      <p>
        Songbook does not review, verify, index, or endorse the content you import, and does not make
        any user&apos;s content publicly searchable or browsable by other users.
      </p>

      <h2>3. Sharing content</h2>
      <p>
        Features like Sing Together let you share a live view of a song with other people via a link,
        for personal, informal use (for example, playing and singing with friends). Participants can
        open that link without an account, and see only what you display for the duration of the
        session.
      </p>
      <p>
        This is not a publishing or distribution feature. It does not grant any rights over the
        underlying copyrighted work to Songbook or to session participants, and participants should
        not record or redistribute what is shown to them.
      </p>

      <h2>4. Copyright concerns</h2>
      <p>
        If you believe that content stored by a user of Songbook infringes your copyright, contact us
        at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with details of the content, the work you claim
        is infringed, and your contact information. The matter will be reviewed in accordance with
        applicable law, and content will be removed where the claim is well founded.
      </p>

      <h2>5. Changes to this notice</h2>
      <p>
        We may update this notice from time to time. Significant changes will be communicated through
        the app or by email.
      </p>
    </>
  )
}
