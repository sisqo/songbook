'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { IconClose } from '@/components/icons'
import { LIMIT_MESSAGE, limitSentence, type LimitFacts, type LimitReason } from '@/lib/plans/types'

/** What a plan refused, exactly as a `WriteRefusal` carries it once its reason is known to be a `LimitReason`. */
export interface PlanNotice {
  reason: LimitReason
  limit?: LimitFacts
  /**
   * Named only when there is one feature to blame for a `plan-required` refusal with no cap
   * to quote — Sing Together, the printable booklet — so the dialog can say what was refused
   * rather than fall back to `LIMIT_MESSAGE`'s vaguest line, "This is not included in your
   * plan." Left unset for a count refusal, where `limit` already names the cap, and for
   * `frozen`, which is over more than one cap at once and would misname the problem by
   * blaming a single feature.
   */
  feature?: string
}

/**
 * Told in place of the inline notice whenever a write was refused by the plan rather than by
 * a permission — same two facts `writeMessage`/`saveMessage` already read, just carried to a
 * dialog instead of a `<p>` in the flow, since "install a bigger plan" is a decision worth
 * its own screen rather than a line easy to miss among the others near it.
 *
 * `frozen` is the one reason with no purchase that fixes it — see `LimitReason`'s own comment
 * in `plans/types.ts` — so it is also the one case here with no "See plans" button: telling
 * someone to buy more when the answer is to delete would be both wrong and expensive.
 */
export function PlanUpgradeModal({ notice, onClose }: { notice: PlanNotice; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canUpgrade = notice.reason !== 'frozen'
  const message =
    notice.limit !== undefined
      ? limitSentence(notice.limit)
      : notice.feature !== undefined
        ? `${notice.feature} is not included in your plan.`
        : LIMIT_MESSAGE[notice.reason]

  return (
    <div className="upgrade-overlay" role="dialog" aria-modal="true" aria-label="Plan limit">
      <div className="upgrade-backdrop" onClick={onClose} aria-hidden />

      <div className="upgrade-card">
        <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <h2 className="section-title">{canUpgrade ? 'Upgrade to continue' : 'Over your plan’s limit'}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>

        <div className="upgrade-actions">
          {canUpgrade && (
            <Link href="/pricing" className="btn btn-primary btn-sm" onClick={onClose}>
              See plans
            </Link>
          )}
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            {canUpgrade ? 'Not now' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
