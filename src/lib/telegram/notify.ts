/**
 * Push notifications to a Telegram chat for events worth knowing about the instant they
 * happen — new registration, purchase, downgrade, cancellation. Same shape as `sendEmail`
 * (`email/send.ts`): a no-op when unconfigured, and never throws — by the time this is
 * called, the action it's a side effect of has already committed its write, and a failed
 * or skipped notification must not undo that.
 *
 * `TELEGRAM_CHAT_ID` rather than a channel name: a bot only ever sees chats it has been
 * added to or messaged first, so the numeric id is what Telegram's `getUpdates` call
 * returns once the bot has received at least one message.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function notifyTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log(`[telegram] ${text}`)
    return
  }

  try {
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
