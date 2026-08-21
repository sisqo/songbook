/**
 * The one "card number" the test checkout (`CheckoutScreen`) accepts — every other number is
 * declined, the same way a real processor would reject a typo or an unsupported card. Not a
 * security boundary: the whole screen is a mock (see `checkout.ts`'s own header on why nothing
 * here charges a card), and this check runs entirely in the browser, before `mockPurchase` is
 * ever called. Its only job is to make trying the flow with the wrong number *feel* like a
 * checkout that can fail, rather than a button that always succeeds regardless of what is
 * typed above it.
 *
 * `4111 1111 1111 1111` rather than a number invented for this app: it is the same well-known
 * Visa test number test suites already use everywhere else, so a tester who has seen a mock
 * checkout before already knows what to type here without being told.
 */
export const ACCEPTED_TEST_CARD = '4111 1111 1111 1111'

/** Compares digits only, so spacing or punctuation typed around them never causes a false decline. */
export function isAcceptedTestCard(number: string): boolean {
  return number.replace(/\D/g, '') === ACCEPTED_TEST_CARD.replace(/\D/g, '')
}
