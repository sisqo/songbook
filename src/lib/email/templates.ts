/**
 * The three emails Resend sends (PLAN.md, v3.2 point 8): verification, welcome, and
 * password reset. Each returns `{ subject, html, text }` — plain data, no `sendEmail`
 * call inside — so the flows that own the actual send (registration, verification,
 * password recovery) decide the recipient themselves.
 *
 * Colors are the light half of `globals.css`'s palette, copied as hex rather than
 * `var(--x)`: most webmail clients strip `<style>` blocks and custom properties along
 * with them, and there is no dark mode to switch between in an inbox anyway.
 */

import { APP_NAME, APP_PAYOFF } from '@/lib/brand'

/*
 * No brand mark here: the app's is `<IconNote />` in a squircle (`.brand-mark`,
 * `.hero-mark-fill`), an SVG that mail clients render inconsistently at best. Rather
 * than invent a letter-based stand-in that does not exist anywhere else in the app, the
 * wordmark carries the header alone.
 */

const BG = '#f6f5f2'
const SURFACE = '#ffffff'
const INK = '#16181d'
const MUTED = '#5c626c'
const LINE = '#dcdad4'
const ACCENT = '#97490f'
const ON_ACCENT = '#fffaf4'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

/**
 * The chrome every email shares: the wash and the card go on a wrapper `<div>`, not on
 * `<body>` — Gmail and most other webmail rewrite or drop a message's own `<body>` tag
 * and whatever is styled directly on it.
 */
function layout(bodyHtml: string): string {
  return `<div style="background:${BG};padding:32px 16px;font-family:${FONT};">
  <div style="max-width:480px;margin:0 auto;background:${SURFACE};border:1px solid ${LINE};border-radius:20px;padding:36px 32px;">
    <p style="margin:0 0 28px;font-size:16px;font-weight:600;color:${INK};letter-spacing:-0.02em;">${APP_NAME}</p>
    ${bodyHtml}
  </div>
  <p style="max-width:480px;margin:20px auto 0;padding:0 4px;color:${MUTED};font-size:12px;line-height:1.5;text-align:center;">
    ${APP_NAME} — ${APP_PAYOFF}
  </p>
</div>`
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;color:${INK};font-size:20px;font-weight:600;letter-spacing:-0.02em;">${text}</h1>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${MUTED};font-size:14px;line-height:1.55;">${text}</p>`
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin:4px 0 20px;padding:13px 26px;background:${ACCENT};color:${ON_ACCENT};font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${label}</a>`
}

function fallbackLink(url: string): string {
  return `<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;word-break:break-all;">
    Or copy and paste this link into your browser:<br />
    <a href="${url}" style="color:${ACCENT};">${url}</a>
  </p>`
}

export function verificationEmail(url: string): EmailTemplate {
  const subject = `Verify your email for ${APP_NAME}`

  const html = layout(`
    ${heading('Verify your email')}
    ${paragraph('Click the button below to verify your email address and finish setting up your account. This link expires in 24 hours.')}
    ${button('Verify email', url)}
    ${fallbackLink(url)}
  `)

  const text = `Verify your email

Click the link below to verify your email address and finish setting up your account. This link expires in 24 hours.

${url}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

export function welcomeEmail(): EmailTemplate {
  const subject = `Welcome to ${APP_NAME}`

  const html = layout(`
    ${heading(`Welcome to ${APP_NAME}`)}
    ${paragraph('Your account is ready. Import the songs you already have, build your songbooks, and take them with you — on stage, in rehearsal, even offline.')}
  `)

  const text = `Welcome to ${APP_NAME}

Your account is ready. Import the songs you already have, build your songbooks, and take them with you — on stage, in rehearsal, even offline.

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

export function passwordResetEmail(url: string): EmailTemplate {
  const subject = `Reset your ${APP_NAME} password`

  const html = layout(`
    ${heading('Reset your password')}
    ${paragraph("Click the button below to choose a new password. If you didn't request this, you can safely ignore this email — your password won't change.")}
    ${button('Reset password', url)}
    ${fallbackLink(url)}
  `)

  const text = `Reset your password

Click the link below to choose a new password. If you didn't request this, you can safely ignore this email — your password won't change.

${url}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}
