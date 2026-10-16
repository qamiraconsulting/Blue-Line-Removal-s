import { site } from "../../data/site.js";
import type { DepositInfo } from "./deposit.js";
import { esc, firstName, formatAud, formatDateLabel, NAVY, ORANGE, shell, type EmailContent, type QuoteDetails } from "./emails.js";

// Booking emails. The inspection happens on the move day itself, so a booking is made on the
// estimate and the final charges are confirmed on the day (Ayesha, 2026-10-12). The customer
// must agree to BOOKING_TERMS in the chat before a booking request is taken; the exact text
// and its version are stored with the booking.

export const BOOKING_TERMS_VERSION = "2026-10-12";
export const BOOKING_TERMS =
  "Your booking is made on the estimate above. On the day of your move, before we start, our team will inspect what's being moved, the access and the parking, and confirm the final charges with you. The final price may vary depending on the actual hours worked, inventory, access, stairs, parking and any special requirements.";

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
  return [
    `To lock in your booking we take a ${formatAud(deposit.amountAud)} deposit before the move.`,
    deposit.paymentLink ? `Pay it securely here: ${deposit.paymentLink}` : "We will send you a secure payment link for it shortly.",
    deposit.finalPayment,
  ];
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
  const opening = input.kind === "confirmed" ? "Your move with us is booked. Here are the details:" : "Your booking has been updated. Here are the new details:";
  const closing = "Our team will confirm the final charges with you on the day, before we start. If anything needs to change, just call us.";
  const text = [greeting, "", opening, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", closing, `Call us on ${site.phone.display}.`, "", site.name].join("\n");
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join("");
  const html = shell(`
<p style="margin:0 0 14px">${esc(greeting)}</p>
<p style="margin:0 0 14px;color:${NAVY}">${esc(opening)}</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${table}</table>
<p style="margin:0 0 14px">${esc(closing)}</p>
<p style="margin:0">Call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>`);
  return {
    subject: input.kind === "confirmed" ? `Your move is booked: ${formatDateLabel(input.date)}, ${formatArrivalTime(input.arrivalTime)}` : `Your booking has been updated: ${formatDateLabel(input.date)}, ${formatArrivalTime(input.arrivalTime)}`,
    text,
    html,
  };
}

/** Internal: a customer agreed to the terms (chat or website form) and asked to book. */
export function renderBookingTeamEmail(input: BookingEmailInput & { phone: string; email: string; testMode: boolean; autoConfirmed: boolean; capacityNote?: string | null; via?: string }): EmailContent {
  const where = input.via === "quote_form" ? "on the website form" : "in the chat";
  const text = [
    `${input.testMode ? "[TEST MODE -- placeholder rate card] " : ""}${input.autoConfirmed ? `BOOKED -- confirmed instantly ${where} and added to the calendar` : `BOOKING REQUEST (${where}) -- please confirm with the customer`}`,
    "",
    ...(input.capacityNote ? [`TRUCK: ${input.capacityNote}`, ""] : []),
    ...(input.deposit?.required
      ? [
          `DEPOSIT: ${formatAud(input.deposit.amountAud)} required (move is ${input.deposit.daysUntilMove} days away) -- ${input.deposit.paymentLink ? "the customer was given the payment link" : "NO PAYMENT LINK SET UP: please send the customer one"}. Check it is paid before confirming.`,
          "",
        ]
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
      ? "Nothing to do -- it's in the calendar. Cancel it on the dashboard (Bookings & capacity) if anything's wrong."
      : "Check it on the dashboard under Booking requests -- you can change the details or the amount (with a note to the customer) before confirming. The customer gets the PDF quote when you confirm.",
  ].join("\n");
  return {
    subject: `${input.autoConfirmed ? "Booked" : "Booking request"}: ${input.name} -- ${input.details.dateLabel || "date tbc"} (${input.reference})`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
