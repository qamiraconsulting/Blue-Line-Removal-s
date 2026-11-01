import { site } from "../../data/site.js";
import type { DepositInfo } from "./deposit.js";
import { esc, firstName, formatAud, formatDateLabel, NAVY, ORANGE, shell, type EmailContent, type QuoteDetails } from "./emails.js";

// Booking emails. The inspection happens on the move day itself, so a booking is made on the
// estimate and the final charges are confirmed on the day (Ayesha, 2026-10-12). The customer
// must agree to BOOKING_TERMS in the chat before a booking request is taken; the exact text
// and its version are stored with the booking.

export const BOOKING_TERMS_VERSION = "2026-10-28";
/** In the "your move is booked" email, in place of the full terms (Ayesha, 2026-10-28). */
export const BOOKED_DAY_NOTE = "On the day, before we start, our team will check what's being moved and the access, and confirm the final charges with you (if needed).";

/** Blue Line, 28 Oct: cancellations only by phone, at least 72 hours before the move day. */
export const CANCELLATION_POLICY = "To cancel or change your booking, please call us at least 72 hours before your move day. Cancellations are only taken by phone.";

export const BOOKING_TERMS =
  "Your booking is made on the estimate above. On the day of your move, before we start, our team will inspect what's being moved, the access and the parking, and confirm the final charges with you. The final price may vary depending on the actual hours worked, inventory, access, stairs, parking and any special requirements. " +
  CANCELLATION_POLICY;

export interface BookingEmailInput {
  name: string;
  reference: string;
  amountAud: number;
  details: QuoteDetails;
  notes: string;
  /** "HH:MM" when the customer picked an arrival time. */
  arrivalTime?: string | null;
  /** The booking deposit (move a week or more away). */
  deposit?: DepositInfo;
}

/** What the customer is told about the deposit and paying the rest. Empty when no deposit applies. */
export function depositLines(deposit: DepositInfo | undefined): string[] {
  if (!deposit?.required) return [];
  if (deposit.paid) return [`Thanks -- we've received your ${formatAud(deposit.amountAud)} deposit.`, deposit.finalPayment];
  return [
    `To lock in your booking we take a ${formatAud(deposit.amountAud)} deposit before the move.`,
    deposit.paymentLink
      ? `Pay it securely here, by card or straight from your bank account: ${deposit.paymentLink}`
      : "We will send you a secure payment link for it shortly.",
    ...(deposit.paymentLink
      ? [`The link works for ${deposit.linkValidHours ?? 24} hours. As soon as it's paid we confirm your booking (if your arrival time is still free) and email you.`]
      : []),
    deposit.finalPayment,
  ];
}

/** The team's one-line view of the deposit. */
function teamDepositLine(deposit: DepositInfo): string {
  const amount = formatAud(deposit.amountAud);
  if (deposit.paid) return `DEPOSIT: ${amount} PAID (Stripe).`;
  if (deposit.demo) {
    return `DEPOSIT: ${amount} required (move is ${deposit.daysUntilMove} days away) -- the customer was given the DEMO payment page (Stripe isn't connected yet, so no payment can be taken): send them a real payment link and check it is paid before confirming.`;
  }
  if (deposit.paymentLink) {
    return `DEPOSIT: ${amount} required (move is ${deposit.daysUntilMove} days away) -- the customer was given a secure Stripe payment link. When it's paid the booking is confirmed automatically if the time is still free; you'll get an email either way.`;
  }
  return `DEPOSIT: ${amount} required (move is ${deposit.daysUntilMove} days away) -- NO PAYMENT LINK SET UP: please send the customer one. Check it is paid before confirming.`;
}

export interface DepositAlertInput {
  name: string;
  phone: string;
  email: string;
  reference: string;
  dateLabel: string;
  arrivalTime: string | null;
  /** "card" / "payto" etc. */
  method?: string | null;
  testMode: boolean;
}

const alertBody = (input: DepositAlertInput, lines: string[]) =>
  [
    ...lines,
    "",
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    `Date: ${input.dateLabel || "not set"}`,
    `Arrival time: ${input.arrivalTime ? formatArrivalTime(input.arrivalTime) : "not chosen"}`,
    `Reference: ${input.reference}`,
    ...(input.testMode ? ["", "(Stripe TEST payment -- no real money.)"] : []),
  ].join("\n");

const plain = (subject: string, text: string): EmailContent => ({
  subject,
  text,
  html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
});

/** Internal: the deposit is paid but the booking couldn't be confirmed automatically. */
export function renderDepositPaidTeamEmail(input: DepositAlertInput & { problem: string }): EmailContent {
  return plain(
    `${input.testMode ? "[TEST] " : ""}ACTION NEEDED -- deposit paid, booking not confirmed: ${input.name} (${input.reference})`,
    alertBody(input, [
      `The customer has PAID the ${formatAud(100)} deposit${input.method ? ` (${input.method})` : ""}, but the booking could not be confirmed automatically: ${input.problem}.`,
      "",
      "Please call the customer to agree a time and confirm it on the dashboard (Booking requests), or refund the deposit in Stripe (Payments -> find the reference -> Refund).",
    ]),
  );
}

/** Internal: the payment page expired unpaid, or the bank payment failed. */
export function renderDepositNotPaidTeamEmail(input: DepositAlertInput & { why: "expired" | "failed" }): EmailContent {
  const what = input.why === "expired" ? "the 24-hour payment link expired without payment" : "the bank (PayTo) payment didn't go through";
  return plain(
    `${input.testMode ? "[TEST] " : ""}Deposit not paid: ${input.name} (${input.reference})`,
    alertBody(input, [
      `Booking request ${input.reference}: ${what}. The booking is NOT confirmed.`,
      "",
      "Follow up with the customer. If they still want the date, they can ask for a new link in the chat (or you can confirm the booking yourself on the dashboard).",
    ]),
  );
}

/** "07:30" -> "7:30am". */
export function formatArrivalTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

function detailRows(input: BookingEmailInput): [string, string][] {
  const d = input.details;
  const rows: [string, string][] = [
    ["Estimate", `${formatAud(input.amountAud)} (GST included)`],
    ["From", d.from],
    ["To", d.to],
    ["Date", d.dateLabel],
    ["Arrival time", input.arrivalTime ? formatArrivalTime(input.arrivalTime) : ""],
    ["Home size", d.propertySize],
    ["Truck & crew", d.capacity],
    ["Access", d.accessNotes],
    ["Your notes", input.notes],
    ["Reference", input.reference],
  ];
  return rows.filter(([, v]) => Boolean(v));
}

function customerEmail(input: BookingEmailInput, subject: string, opening: string, closing: string): EmailContent {
  const rows = detailRows(input);
  const text = [
    `Hi ${firstName(input.name)},`,
    "",
    opening,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...depositLines(input.deposit).flatMap((l) => [l, ""]),
    BOOKING_TERMS,
    "",
    closing,
    `Questions? Call us on ${site.phone.display}.`,
    "",
    site.name,
  ].join("\n");

  const table = rows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(input.name))},</p>
<p style="margin:0 0 14px;color:${NAVY}">${esc(opening)}</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${table}</table>
${depositLines(input.deposit)
    .map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`)
    .join("")}
<p style="margin:0 0 14px;font-size:13px;color:#5b6b7c">${esc(BOOKING_TERMS)}</p>
<p style="margin:0 0 14px">${esc(closing)}</p>
<p style="margin:0">Questions? Call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>`);

  return { subject, text, html };
}

/** To the customer, right after they agree to the terms in the chat. */
export function renderBookingRequestEmail(input: BookingEmailInput): EmailContent {
  return customerEmail(
    input,
    `We've received your booking request (ref ${input.reference})`,
    "Thanks for booking with us! We've received your booking request on these terms:",
    "One of the team will confirm your booking shortly.",
  );
}

/** To the customer, when the team confirms the booking from the dashboard. */
export function renderBookingConfirmedEmail(input: BookingEmailInput): EmailContent {
  return customerEmail(input, `Your move is booked (ref ${input.reference})`, "Good news -- your move is booked.", "See you on the day!");
}

/**
 * To the customer, when the team books (or moves) a job from the calendar -- a phone booking,
 * or a trip set up on Truck trips. Just the date, time and addresses: no price (the team gave
 * it on the phone), no terms.
 */
export function renderManualBookingEmail(input: {
  name: string | null;
  kind: "confirmed" | "rescheduled";
  date: string;
  arrivalTime: string;
  from?: string | null;
  to?: string | null;
  reference?: string | null;
}): EmailContent {
  const rows = ([
    ["Date", formatDateLabel(input.date)],
    ["Arrival time", formatArrivalTime(input.arrivalTime)],
    ["From", input.from ?? ""],
    ["To", input.to ?? ""],
    ["Reference", input.reference ?? ""],
  ] as [string, string][]).filter(([, v]) => Boolean(v));
  const greeting = input.name ? `Hi ${firstName(input.name)},` : "Hi,";
  const opening = input.kind === "confirmed" ? "A reminder of your move with us. Here are the details:" : "Your booking has been updated. Here are the new details:";
  const text = [greeting, "", opening, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Call us on ${site.phone.display}.`, "", site.name].join("\n");
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
  const html = shell(`
<p style="margin:0 0 14px">${esc(greeting)}</p>
<p style="margin:0 0 14px;color:${NAVY}">${esc(opening)}</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${table}</table>
<p style="margin:0">Call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>`);
  return {
    subject: input.kind === "confirmed" ? `Reminder: your move on ${formatDateLabel(input.date)}, ${formatArrivalTime(input.arrivalTime)}` : `Your booking has been updated: ${formatDateLabel(input.date)}, ${formatArrivalTime(input.arrivalTime)}`,
    text,
    html,
  };
}

/** Internal: a customer agreed to the terms (chat or website form) and asked to book. */
export function renderBookingTeamEmail(input: BookingEmailInput & { phone: string; email: string; testMode: boolean; autoConfirmed: boolean; capacityNote?: string | null; via?: string }): EmailContent {
  const where = input.via === "quote_form" ? "on the website form" : "in the chat";
  const text = [
    `${input.testMode ? "[TEST MODE -- placeholder rate card] " : ""}${input.autoConfirmed ? (input.deposit?.paid ? `BOOKED -- the deposit was paid, so it was confirmed automatically and added to the calendar` : `BOOKED -- confirmed instantly ${where} and added to the calendar`) : `BOOKING REQUEST (${where}) -- please confirm with the customer`}`,
    "",
    ...(input.capacityNote ? [`TRUCK: ${input.capacityNote}`, ""] : []),
    ...(input.deposit?.required
      ? [teamDepositLine(input.deposit), ""]
      : []),
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    ...detailRows(input).map(([k, v]) => `${k}: ${v}`),
    "",
    `Agreed ${where} to the booking terms (version ${BOOKING_TERMS_VERSION}):`,
    BOOKING_TERMS,
    "",
    input.autoConfirmed
      ? "Nothing to do -- it's in the calendar. Cancel it on the dashboard (Booking and trucks) if anything's wrong."
      : "Check it on the dashboard under Booking requests -- you can change the details or the amount (with a note to the customer) before confirming. The customer gets the PDF quote when you confirm.",
  ].join("\n");
  return {
    subject: `${input.autoConfirmed ? (input.deposit?.paid ? "Booked + deposit paid" : "Booked") : "Booking request"}: ${input.name} -- ${input.details.dateLabel || "date tbc"} (${input.reference})`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
