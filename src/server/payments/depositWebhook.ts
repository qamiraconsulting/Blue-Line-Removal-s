import { confirmPaidBooking, type BookingDeps } from "../quote/booking.js";
import { formatArrivalTime, renderDepositNotPaidTeamEmail, renderDepositPaidTeamEmail, type DepositAlertInput } from "../quote/bookingEmails.js";
import { DEPOSIT_AUD } from "../quote/deposit.js";
import { formatDateLabel } from "../quote/emails.js";
import type { DepositStore } from "./depositPayment.js";
import type { CheckoutSessionEvent } from "./stripe.js";

// What happens when Stripe tells us about a booking's deposit page (api/stripe/webhook.ts has
// already checked the message really came from Stripe):
//  - paid (card at once; PayTo a moment later)  -> record it, then confirm the booking
//    automatically if its time is still free; otherwise email the team to sort it out
//  - PayTo approved but not yet settled          -> "processing", wait for the next message
//  - PayTo failed / the page expired unpaid      -> email the team; the booking isn't confirmed
// Stripe may send a message more than once, or out of order: everything here is safe to repeat.
//
// Two things make that safe AND fast (found in the first real test, 18 Oct 2026, when a delivery
// took 27 s, Stripe gave up after ~20 s and retried):
//  - the order of work: record the payment -> confirm the booking in the calendar (a few
//    seconds) -> answer Stripe -> THEN send the emails/PDF/driver notice (`defer`);
//  - a repeat message for a payment that is already recorded does not stop at "duplicate" if
//    the booking is still unconfirmed: it tries the confirmation again, so a delivery that died
//    between "recorded" and "confirmed" can't leave a paid booking stranded.

export interface DepositWebhookDeps extends BookingDeps {
  depositStore: DepositStore;
  /** Adds a message to the customer's chat so they see what happened if they come back. */
  chatNote?: (conversationId: string, text: string) => Promise<void>;
  /**
   * Hands work to run AFTER the reply to Stripe has been sent (Vercel's waitUntil). Unset =
   * the work is simply awaited first (tests, local dev).
   */
  defer?: (work: Promise<unknown>) => void;
}

export type WebhookOutcome =
  | "ignored"
  | "not_ours"
  | "processing"
  | "duplicate"
  | "confirmed"
  | "already_confirmed"
  | "needs_team"
  | "expired"
  | "failed"
  | "stale";

const HANDLED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);

export async function handleStripeEvent(event: CheckoutSessionEvent, deps: DepositWebhookDeps): Promise<WebhookOutcome> {
  const session = event.data?.object;
  if (!HANDLED.has(event.type) || session?.object !== "checkout.session") return "ignored";

  // Only pages this app made carry the booking reference (Blue Line may take other payments).
  const reference = (session.metadata?.reference ?? session.client_reference_id ?? "").trim().toUpperCase();
  if (!reference) return "not_ours";
  const q = await deps.bookings.findQuote(reference);
  if (!q) return "not_ours";

  const alert: DepositAlertInput = {
    name: q.customerName,
    phone: q.phone,
    email: q.email,
    reference: q.reference,
    dateLabel: formatDateLabel(q.movingDate),
    arrivalTime: q.bookingArrivalTime,
    testMode: !event.livemode,
  };
  const teamEmail = (content: { subject: string; text: string; html: string }) =>
    deps.sendEmail({ ...content, to: deps.teamEmail, replyTo: `${q.customerName} <${q.email}>`, kind: "team" }).catch(() => false);
  const note = async (text: string) => {
    if (q.conversationId && deps.chatNote) await deps.chatNote(q.conversationId, text).catch(() => undefined);
  };

  const paid = (event.type === "checkout.session.completed" && session.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded";

  if (event.type === "checkout.session.completed" && !paid) {
    await deps.depositStore.markProcessing(reference, session.id);
    return "processing";
  }

  if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    const why = event.type === "checkout.session.expired" ? "expired" : "failed";
    // Only the booking's current page counts -- an old, replaced page expiring means nothing.
    if (!(await deps.depositStore.markEnded(reference, session.id, why))) return "stale";
    if (q.bookingStatus === "requested") {
      await teamEmail(renderDepositNotPaidTeamEmail({ ...alert, why }));
      await note(
        why === "expired"
          ? `Your deposit payment link for booking ${q.reference} has expired, so the booking isn't confirmed yet. Reply here if you'd like a new link, or call us.`
          : `Your bank payment for the deposit on booking ${q.reference} didn't go through, so the booking isn't confirmed yet. Reply here if you'd like a new link, or call us.`,
      );
    }
    return why;
  }

  // Paid. Record it once (a repeat message stops here).
  const method = event.type === "checkout.session.async_payment_succeeded" ? "bank (PayTo)" : "card";
  const amountCents = session.amount_total ?? 0;
  const recorded = await deps.depositStore.markPaid(reference, {
    checkoutId: session.id,
    amountCents,
    paymentIntentId: session.payment_intent ?? null,
    method,
    testMode: !event.livemode,
  });
  // A repeat message: the payment was recorded earlier. Only carry on if the booking is still
  // waiting to be confirmed (the earlier delivery may have stopped half way).
  if (!recorded && q.bookingStatus !== "requested") return "duplicate";
  alert.method = method;

  if (session.currency !== "aud" || amountCents !== DEPOSIT_AUD * 100) {
    await teamEmail(renderDepositPaidTeamEmail({ ...alert, problem: `the amount paid was ${(amountCents / 100).toFixed(2)} ${(session.currency ?? "").toUpperCase()}, not the $${DEPOSIT_AUD} deposit` }));
    return "needs_team";
  }

  const result = await confirmPaidBooking(reference, !event.livemode, deps);
  if (result.outcome === "confirmed") {
    // The booking is confirmed. The notices and the chat note (which says whether the customer
    // was emailed) finish after Stripe has its answer.
    const finish = result.notices.then((emailed) =>
      note(
        `Thanks -- we've received your $${DEPOSIT_AUD} deposit. Your move is booked for ${formatDateLabel(result.date)} with arrival at ${formatArrivalTime(result.arrivalTime)}${emailed ? ", and we've emailed your confirmation" : ""}. Reference ${q.reference}.`,
      ),
    );
    if (deps.defer) deps.defer(finish);
    else await finish;
    return "confirmed";
  }
  if (result.outcome === "already_confirmed") {
    // On a repeat message this just means the earlier delivery got there first.
    if (!recorded) return "duplicate";
    await note(`Thanks -- we've received your $${DEPOSIT_AUD} deposit for booking ${q.reference}.`);
    return "already_confirmed";
  }
  await teamEmail(renderDepositPaidTeamEmail({ ...alert, problem: result.problem }));
  await note(`Thanks -- we've received your $${DEPOSIT_AUD} deposit for booking ${q.reference}. One of the team will be in touch shortly to confirm your booking.`);
  return "needs_team";
}
