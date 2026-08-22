/**
 * Push notifications to a Telegram chat for the events worth knowing about the instant they
 * happen — new registration, purchase, downgrade, cancellation. Same shape as `sendEmail`
 * (`email/send.ts`): a no-op when unconfigured, and never throws — by the time this is
 * called, the action it's a side effect of has already committed its write, and a failed
 * or skipped notification must not undo that.
 *
 * `TELEGRAM_CHAT_ID` rather than a channel name: a bot only ever sees chats it has been
 * added to or messaged first, so the numeric id is what Telegram's `getUpdates` call
 * returns once the bot has received at least one message.
 *
 * **The switch is checked here, not at the call sites**, and that is the point of taking an
 * `event` rather than only a string: four callers each remembering to ask first is four
 * chances to forget, and the one that forgot would keep notifying after an owner had switched
 * it off — with nothing on screen to explain why. One choke point, so the answer cannot differ
 * by caller. The token and chat id stay in the environment; only the *policy* lives in
 * `app_settings` (see `/app-settings`), because a setting a screen can read back is the wrong
 * home for a credential.
 *
 * The whole body is wrapped: `loadNotifySettings` already promises never to throw, and this
 * belt-and-braces `try` is here anyway because of where this function is awaited — inside
 * `auth.ts`'s `signIn` callback, where a rejection would fail the sign-in for a reader whose
 * account has already been created.
 */

import { loadNotifySettings } from '@/lib/settings/read'
import type { NotifyEvent } from '@/lib/settings/types'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function notifyTelegram(event: NotifyEvent, text: string): Promise<void> {
  try {
    const { settings } = await loadNotifySettings()
    // Switched off for this event: nothing sent, and nothing logged either — a log line would
    // read as a delivery in a tail of the deployment's output.
    if (!settings[event]) return

    if (!BOT_TOKEN || !CHAT_ID) {
      console.log(`[telegram] ${text}`)
      return
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    })
    if (!response.ok) console.error('notifyTelegram failed', response.status, await response.text())
  } catch (error) {
    console.error('notifyTelegram failed', error)
  }
}
