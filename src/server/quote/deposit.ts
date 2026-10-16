// The booking deposit (Ayesha, 2026-10-16): when the move is a week or more away, Blue Line
// takes a $100 deposit to lock the booking in. The customer pays it through a secure payment
// link; the rest is paid on the day of the move. The chat never takes card details itself.
//
// DEPOSIT_PAYMENT_URL (env) is the payment link. Until it's set, the customer is told the team
// will send one, and the team email says to send it.

export const DEPOSIT_AUD = 100;
/** A deposit applies when the move is at least this many days away. */
export const DEPOSIT_MIN_DAYS = 7;

export const FINAL_PAYMENT_TEXT = "The rest is paid on the day of the move, by card, bank transfer or cash.";

export interface DepositInfo {
  required: boolean;
  amountAud: number;
  daysUntilMove: number | null;
  /** null = no link set up yet: the team sends one. */
  paymentLink: string | null;
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
