import { site } from "../../data/site.js";

// Plain renderers -- no sending here, so they're trivially testable. The customer
// emails carry ONE estimate and what it includes; no hourly rate, no call-out line, no
// breakdown. User-supplied text is always escaped before it goes into HTML.

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface QuoteDetails {
  from: string;
  to: string;
  dateLabel: string; // already human-formatted, or ""
  propertySize: string; // "2 Bedroom", or ""
  capacity: string; // "4.5 tonne truck, 2 movers" or "Team to inspect and confirm"
  accessNotes: string; // free text from the customer, or ""
}

// Wording required on every estimate (Ayesha's email to Blue Line, 2026-10-12, Part A).
/**
 * Added to every estimate/quote (Blue Line's reply, 25 Oct 2026: "Add this note in the quote").
 * Blue Line's own wording was: "If the team finds any item to be risky/breakable in their
 * assessment at the time of pick up, then they may take a decision of whether or not to move
 * such items."
 */
export const RISKY_ITEMS_NOTE =
  "If our team finds any item risky or breakable when they assess it at pick-up, they may decide whether or not to move that item.";

export const ESTIMATE_DISCLAIMER =
  "This is an estimate based on the details you've provided. The final price may vary depending on the actual hours worked, inventory, access, stairs, parking and any special requirements.";

export const NAVY = "#0e2a47";
export const ORANGE = "#ff6b1a";

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatAud(amount: number): string {
  return `$${amount.toLocaleString("en-AU")}`;
}

export function formatDateLabel(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "there";
}

export function shell(bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c2733;line-height:1.55">
<div style="background:${NAVY};color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">${esc(site.name)}</div>
<div style="padding:24px;border:1px solid #e3e8ee;border-top:0">${bodyHtml}</div>
</div>`;
}

export function renderCustomerQuoteEmail(input: {
  name: string;
  reference: string;
  amountAud: number;
  includes: string[];
  firstMoveApplied: boolean;
  /** The first-order discount %, from the rate card. */
  discountPercent: number;
  validUntilLabel: string;
  details: QuoteDetails;
}): EmailContent {
  const price = formatAud(input.amountAud);
  const offer = `${input.discountPercent}% first-order discount`;
  const rows: [string, string][] = [
    ["From", input.details.from],
    ["To", input.details.to],
    ["Date", input.details.dateLabel],
    ["Home size", input.details.propertySize],
    ["Truck & crew", input.details.capacity],
    ["Access", input.details.accessNotes],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  const text = [
    `Hi ${firstName(input.name)},`,
    "",
    "Thanks for asking for a quote. Here's your estimate:",
    "",
    `  ${price} (GST included)`,
    input.firstMoveApplied ? `  Your ${offer} has been applied.` : "",
    "",
    ESTIMATE_DISCLAIMER,
    RISKY_ITEMS_NOTE,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Included:",
    ...input.includes.map((i) => `  - ${i}`),
    "",
    `Reference: ${input.reference}`,
    `Valid until: ${input.validUntilLabel}`,
    "",
    `To book, reply to this email or call us on ${site.phone.display}.`,
    "If any details change (addresses, date, home size, truck or crew), let us know and we'll update your estimate before your move.",
    "",
    `${site.name}`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(input.name))},</p>
<p style="margin:0 0 14px">Thanks for asking for a quote. Here's your estimate:</p>
<p style="margin:0 0 6px;font-size:34px;font-weight:bold;color:${NAVY}">${esc(price)}</p>
<p style="margin:0 0 14px;color:#5b6b7c;font-size:13px">GST included${input.firstMoveApplied ? ` &middot; <strong style="color:${ORANGE}">${esc(offer)} applied</strong>` : ""}</p>
<p style="margin:0 0 8px">${esc(ESTIMATE_DISCLAIMER)}</p>
<p style="margin:0 0 14px">${esc(RISKY_ITEMS_NOTE)}</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`,
    )
    .join("")}</table>
<p style="margin:0 0 4px"><strong>Included</strong></p>
<ul style="margin:0 0 14px;padding-left:20px">${input.includes.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
<p style="margin:0 0 4px;font-size:13px;color:#5b6b7c">Reference <strong>${esc(input.reference)}</strong> &middot; valid until ${esc(input.validUntilLabel)}</p>
<p style="margin:14px 0">To book, reply to this email or call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>
<p style="margin:0;font-size:13px;color:#5b6b7c">If any details change (addresses, date, home size, truck or crew), let us know and we'll update your estimate before your move.</p>`);

  return { subject: `Your Blue Line Removals estimate: ${price} (ref ${input.reference})`, text, html };
}

export function renderAcknowledgementEmail(input: { name: string; reference: string }): EmailContent {
  const next = "One of the team will review your details and send your estimate shortly.";
  const text = [
    `Hi ${firstName(input.name)},`,
    "",
    "Thanks for your quote request -- we've got it.",
    next,
    "",
    `Your reference: ${input.reference}`,
    `If it's urgent, call us on ${site.phone.display}.`,
    "",
    site.name,
  ].join("\n");

  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(input.name))},</p>
<p style="margin:0 0 14px">Thanks for your quote request &mdash; we've got it.</p>
<p style="margin:0 0 14px">${esc(next)}</p>
<p style="margin:0 0 14px;font-size:13px;color:#5b6b7c">Your reference: <strong>${esc(input.reference)}</strong></p>
<p style="margin:0">If it's urgent, call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>`);

  return { subject: `We've got your quote request (ref ${input.reference})`, text, html };
}

/** Internal notification. May include the cost breakdown -- it never goes to a customer. */
export function renderTeamEmail(input: {
  reference: string;
  name: string;
  phone: string;
  email: string;
  need: string;
  details: QuoteDetails;
  firstMoveRequested: boolean;
  firstMoveApplied: boolean;
  outcomeLine: string;
  internalBreakdown: Record<string, unknown> | null;
  source?: "quote_form" | "chatbot";
  /** Personal-quote requests: the job in the customer's words. */
  jobDescription?: string;
  /** The website form's optional "Additional notes". */
  customerNotes?: string;
}): EmailContent {
  const lines = [
    `Reference: ${input.reference}`,
    `Via: ${input.source === "chatbot" ? "website chat" : "website quote form"}`,
    `Outcome: ${input.outcomeLine}`,
    ...(input.jobDescription ? ["", `The job (customer's words): ${input.jobDescription}`] : []),
    "",
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    `Needs help with: ${input.need === "junk" ? "Junk Removal" : "Moving"}`,
    `Moving from: ${input.details.from || "-"}`,
    `Moving to: ${input.details.to || "-"}`,
    `Preferred date: ${input.details.dateLabel || "-"}`,
    `Home size: ${input.details.propertySize || "-"}`,
    `Truck & crew: ${input.details.capacity || "-"}`,
    `Access notes: ${input.details.accessNotes || "-"}`,
    ...(input.customerNotes ? [`Customer notes: ${input.customerNotes}`] : []),
    `First-customer 10% offer: ${input.firstMoveRequested ? (input.firstMoveApplied ? "applied (no earlier booking with this email or phone)" : "not applied (booked with us before)") : "not checked (database unavailable)"}`,
    ...(input.internalBreakdown ? ["", "Internal breakdown (not shown to the customer):", JSON.stringify(input.internalBreakdown, null, 2)] : []),
  ];
  const text = lines.join("\n");
  return {
    subject: `New quote request from ${input.name} (${input.need === "junk" ? "Junk Removal" : "Moving"}) -- ${input.reference}`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
