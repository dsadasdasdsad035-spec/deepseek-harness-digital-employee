/**
 * Pure types of the email seam: the plain-text message a caller asks to
 * deliver, the closed delivery outcome, and the transport interface providers
 * register. Free of host-side value imports.
 *
 * @module @deepseek-ai/dsh-email/types
 */

/** One plain-text email a caller asks to deliver. */
export interface EmailMessage {
  /** Recipient address. */
  readonly to: string
  /** Subject line; non-empty. */
  readonly subject: string
  /** Plain-text body; non-empty. */
  readonly text: string
}

/**
 * The closed outcome of one delivery attempt. `delivered: false` carries a
 * non-empty reason naming what failed; callers record it instead of throwing.
 */
export type EmailDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: string }

/** One SMTP transport a provider registers under a stable id. */
export interface EmailTransport {
  /** Stable transport id used by configuration surfaces. */
  readonly id: string
  /**
   * Deliver one message. MUST resolve to a closed {@link EmailDelivery} —
   * never reject — so a failing mail path cannot crash the calling flow.
   * @param message - the message to deliver.
   */
  send(message: EmailMessage): Promise<EmailDelivery>
}
