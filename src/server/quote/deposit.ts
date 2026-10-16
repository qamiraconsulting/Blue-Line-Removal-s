// The booking deposit (Ayesha, 2026-10-16): when the move is a week or more away, Blue Line
// takes a $100 deposit to lock the booking in. The customer pays it on a secure Stripe page made
// for their booking (card, or straight from their bank account with PayTo) -- see
// src/server/payments. Once Stripe says it's paid, the booking is confirmed automatically if its
// time is still free. The rest is paid on the day of the move. The chat never takes card details.
//
// Without Stripe set up (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET), the customer is told the
// team will send a payment link, and the team email says to send one.

export const DEPOSIT_AUD = 100;
/** A deposit applies when the move is at least this many days away. */
export const DEPOSIT_MIN_DAYS = 7;

export const FINAL_PAYMENT_TEXT = "The rest is paid on the day of the move, by card, bank transfer or cash.";

export interface DepositInfo {
  required: boolean;
  amountAud: number;
  daysUntilMove: number | null;
  /** This booking's secure payment page. null = none yet (no booking yet, or the team sends one). */
  paymentLink: string | null;
  /** How long the payment link stays open. */
  linkValidHours?: number;
  /** Already paid (e.g. the customer asks again after paying). */
  paid?: boolean;
  finalPayment: string;
}

const utcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function depositFor(movingDate: string | null, today: string, paymentLink: string | null | undefined): DepositInfo {
  const daysUntilMove = movingDate ? Math.round((utcDay(movingDate) - utcDay(today)) / 86_400_000) : null;
  return {
    required: daysUntilMove !== null && daysUntilMove >= DEPOSIT_MIN_DAYS,
    amountAud: DEPOSIT_AUD,
    daysUntilMove,
    paymentLink: paymentLink || null,
    finalPayment: FINAL_PAYMENT_TEXT,
  };
}

/**
 * Chat: the model writes this where the booking's payment link goes, and the exact link is put
 * in its place (src/server/chat/agent.ts) -- the model never retypes the long Stripe link.
 */
export const DEPOSIT_LINK_MARKER = "[[deposit_link]]";
