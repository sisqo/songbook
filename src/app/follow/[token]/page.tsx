import type { Metadata } from 'next'

import { FollowSession } from '@/components/FollowSession'

export const metadata: Metadata = { title: 'Sing Together' }

interface Props {
  params: Promise<{ token: string }>
}

/**
 * A Sing Together link: the one page in this app a browser with no account may open.
 *
 * The shell here is deliberately thin — no `PrefsProvider`, no `SongbookProvider`, no
 * `RoleProvider`, no `TopBar`. Every one of those exists to serve a *signed-in* reader:
 * `RoleProvider` asks who is allowed to edit, `SongbookProvider` keeps a mutable copy of
 * a repertoire this visitor has full read access to anyway through the guest actions,
 * and `TopBar`'s menu opens onto sign-out and settings that belong to an account this
 * visitor does not have. Reaching for any of them would mean teaching each one about a
 * guest, for a screen that needs none of what they provide.
 *
 * Nor does this page ask whether `token` is actually live — that would be a second place
 * checking the one thing `FollowSession` already has to check on its own first poll, and
 * the two could disagree about what a guest sees between the moment this renders and the
 * moment the client mounts. So the token is handed over unread, and "is this broadcast
 * still there" stays a question with exactly one asker.
 */
export default async function FollowPage({ params }: Props) {
  const { token } = await params

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
      <FollowSession token={token} />
    </main>
  )
}
