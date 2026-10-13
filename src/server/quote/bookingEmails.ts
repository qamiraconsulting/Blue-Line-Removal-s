import { site } from "../../data/site.js";
import { esc, firstName, formatAud, NAVY, ORANGE, shell, type EmailContent, type QuoteDetails } from "./emails.js";

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

/** Internal: a customer agreed to the terms in the chat and asked to book. */
export function renderBookingTeamEmail(input: BookingEmailInput & { phone: string; email: string; testMode: boolean; autoConfirmed: boolean }): EmailContent {
  const text = [
    `${input.testMode ? "[TEST MODE -- placeholder rate card] " : ""}${input.autoConfirmed ? "BOOKED -- confirmed instantly in the chat and added to the calendar" : "BOOKING REQUEST -- please confirm with the customer"}`,
    "",
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    ...detailRows(input).map(([k, v]) => `${k}: ${v}`),
    "",
    `Agreed in the chat to the booking terms (version ${BOOKING_TERMS_VERSION}):`,
    BOOKING_TERMS,
    "",
    input.autoConfirmed
      ? "Nothing to do -- it's in the calendar. Cancel it on the dashboard (Bookings & capacity) if anything's wrong."
      : "Confirm it on the dashboard under Booking requests -- the customer is emailed when you do.",
  ].join("\n");
  return {
    subject: `${input.autoConfirmed ? "Booked" : "Booking request"}: ${input.name} -- ${input.details.dateLabel || "date tbc"} (${input.reference})`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
