import { site } from "../../data/site.js";

// Plain renderers -- no sending here, so they're trivially testable. The customer
// emails carry ONE price and what it includes; no hourly rate, no call-out line, no
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
  propertySize: string;
}

const NAVY = "#0e2a47";
const ORANGE = "#ff6b1a";

function esc(value: string): string {
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

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "there";
}

function shell(bodyHtml: string): string {
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
  validUntilLabel: string;
  details: QuoteDetails;
}): EmailContent {
  const price = formatAud(input.amountAud);
  const rows: [string, string][] = [
    ["From", input.details.from],
    ["To", input.details.to],
    ["Date", input.details.dateLabel],
    ["Property", input.details.propertySize],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  const text = [
    `Hi ${firstName(input.name)},`,
    "",
    "Thanks for asking for a quote. Here's your fixed price:",
    "",
    `  ${price} (GST included)`,
    input.firstMoveApplied ? "  Your 30% first-move offer has been applied." : "",
    "",
    "This is the final price for the move described below -- no hidden fees or extras on the day.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Included:",
    ...input.includes.map((i) => `  - ${i}`),
    "",
    `Quote reference: ${input.reference}`,
    `Valid until: ${input.validUntilLabel}`,
    "",
    `To book, reply to this email or call us on ${site.phone.display}.`,
    "If any details change (addresses, date or property size), let us know and we'll update your quote before your move.",
    "",
    `${site.name}`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(input.name))},</p>
<p style="margin:0 0 14px">Thanks for asking for a quote. Here's your fixed price:</p>
<p style="margin:0 0 6px;font-size:34px;font-weight:bold;color:${NAVY}">${esc(price)}</p>
<p style="margin:0 0 14px;color:#5b6b7c;font-size:13px">GST included${input.firstMoveApplied ? ` &middot; <strong style="color:${ORANGE}">30% first-move offer applied</strong>` : ""}</p>
<p style="margin:0 0 14px">This is the <strong>final price</strong> for the move described below &mdash; no hidden fees or extras on the day.</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`,
    )
    .join("")}</table>
<p style="margin:0 0 4px"><strong>Included</strong></p>
<ul style="margin:0 0 14px;padding-left:20px">${input.includes.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
<p style="margin:0 0 4px;font-size:13px;color:#5b6b7c">Quote reference <strong>${esc(input.reference)}</strong> &middot; valid until ${esc(input.validUntilLabel)}</p>
<p style="margin:14px 0">To book, reply to this email or call us on <a href="${esc(site.phone.href)}" style="color:${ORANGE};font-weight:bold">${esc(site.phone.display)}</a>.</p>
<p style="margin:0;font-size:13px;color:#5b6b7c">If any details change (addresses, date or property size), let us know and we'll update your quote before your move.</p>`);

  return { subject: `Your Blue Line Removals quote: ${price} (ref ${input.reference})`, text, html };
}

export function renderAcknowledgementEmail(input: { name: string; reference: string }): EmailContent {
  const text = [
    `Hi ${firstName(input.name)},`,
    "",
    "Thanks for your quote request -- we've got it.",
    "One of the team will review your details and send your exact price shortly.",
    "",
    `Your reference: ${input.reference}`,
    `If it's urgent, call us on ${site.phone.display}.`,
    "",
    site.name,
  ].join("\n");

  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(input.name))},</p>
<p style="margin:0 0 14px">Thanks for your quote request &mdash; we've got it.</p>
<p style="margin:0 0 14px">One of the team will review your details and send your exact price shortly.</p>
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
}): EmailContent {
  const lines = [
    `Reference: ${input.reference}`,
    `Outcome: ${input.outcomeLine}`,
    "",
    `Name: ${input.name}`,
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    `Needs help with: ${input.need === "junk" ? "Junk Removal" : "Moving"}`,
    `Moving from: ${input.details.from || "-"}`,
    `Moving to: ${input.details.to || "-"}`,
    `Preferred date: ${input.details.dateLabel || "-"}`,
    `Property size: ${input.details.propertySize || "-"}`,
    `First-move offer: ${input.firstMoveRequested ? (input.firstMoveApplied ? "requested and applied" : "requested, NOT applied (already used)") : "not requested"}`,
    ...(input.internalBreakdown ? ["", "Internal breakdown (not shown to the customer):", JSON.stringify(input.internalBreakdown, null, 2)] : []),
  ];
  const text = lines.join("\n");
  return {
    subject: `New quote request from ${input.name} (${input.need === "junk" ? "Junk Removal" : "Moving"}) -- ${input.reference}`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
