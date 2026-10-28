import { site } from "../../data/site.js";
import { BOOKED_DAY_NOTE, CANCELLATION_POLICY, formatArrivalTime } from "../quote/bookingEmails.js";
import { esc, firstName, formatAud, NAVY, shell, type EmailContent } from "../quote/emails.js";
import type { QuoteLines } from "./lines.js";

// The branded PDF quote for website and chat jobs is made by the SAME Google Apps Script that
// makes Matt's quotes (Ayesha, 2026-10-15): one Drive template, sent from
// hello@bluelineremovals.com.au. The website posts the job to the script's web app (doPost in
// docs/apps-script/blr-website-additions.gs); the script fills the template, makes the PDF and
// emails it. If the script isn't set up or fails, the customer still gets a plain email with
// the same figures (renderPlainQuoteEmail) -- never nothing.
//
// Environment: APPS_SCRIPT_URL (the web app's /exec address) and APPS_SCRIPT_SECRET (shared
// with the script's Script Properties as BLR_SHARED_SECRET). Never logged.

export interface PdfQuoteJob {
  kind: "quote" | "booked";
  /** Who receives it (already redirected to the test inbox in test mode). */
  to: string;
  reference: string;
  customerName: string;
  email: string;
  phone: string;
  movingDate: string | null; // yyyy-mm-dd
  arrivalTime: string | null; // HH:MM
  from: string;
  toAddress: string;
  lines: QuoteLines;
  truckLabel: string | null; // "4.5 tonne truck"
  /** The team's note to the customer about changes, if any. */
  note: string | null;
  /** Only for kind "quote". yyyy-mm-dd */
  validUntil: string | null;
  testMode: boolean;
}

export type PdfSender = (job: PdfQuoteJob) => Promise<boolean>;

const money = (n: number) => n.toFixed(2);

/** "Wednesday, 21 October 2026" -- the format Matt's quotes use. */
export function pdfDate(iso: string | null): string {
  if (!iso) return "To be confirmed";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });
  const month = date.toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" });
  return `${weekday}, ${d} ${month} ${y}`;
}

const utcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

function daysUntil(iso: string | null, today: string): string {
  return iso ? String(Math.round((utcDay(iso) - utcDay(today)) / 86_400_000)) : "";
}

function crewLabel(job: PdfQuoteJob): string {
  const parts = [job.lines.movers ? `${job.lines.movers} movers` : "", job.truckLabel ?? ""].filter(Boolean);
  return parts.join(", ");
}

/** The intro shown above the template's own email text: what this email is and the team's note. */
export function introLines(job: PdfQuoteJob): string[] {
  const when = [pdfDate(job.movingDate), job.arrivalTime ? `arriving ${formatArrivalTime(job.arrivalTime)}` : ""].filter(Boolean).join(", ");
  return [
    ...(job.testMode ? ["TEST -- Blue Line's preview system. This is not a real quote."] : []),
    job.kind === "booked"
      ? `Good news -- your move is booked for ${when}. Your confirmed quote is attached (reference ${job.reference}).`
      : `Your quote from ${site.name} is attached (reference ${job.reference}${job.validUntil ? `, valid until ${pdfDate(job.validUntil)}` : ""}).`,
    ...(job.note ? [`A note from our team: ${job.note}`] : []),
    // Booked on the estimate: the final charges are still confirmed at the move-day inspection
    // (a short note, Ayesha 2026-10-28; the full terms are what the customer agreed to in the chat).
    ...(job.kind === "booked" ? [BOOKED_DAY_NOTE, `${CANCELLATION_POLICY} Phone: ${site.phone.display}.`] : []),
  ];
}

/** The JSON the Apps Script's doPost receives. `values` uses the template's own placeholder names. */
export function appsScriptPayload(job: PdfQuoteJob, today: string, secret: string) {
  const l = job.lines;
  const intro = introLines(job);
  return {
    secret,
    action: "sendQuote",
    to: job.to,
    subject: `${job.testMode ? "[TEST] " : ""}${job.kind === "booked" ? `Your move is booked (ref ${job.reference})` : `Your Blue Line Removals quote (ref ${job.reference})`}`,
    introText: intro.join("\n\n"),
    introHtml: intro.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join(""),
    values: {
      CustomerName: job.customerName,
      Email: job.email,
      Contact: job.phone,
      MoveDate: [pdfDate(job.movingDate), job.arrivalTime ? `arrival ${formatArrivalTime(job.arrivalTime)}` : ""].filter(Boolean).join(", "),
      Pickup: job.from,
      Delivery: job.toAddress,
      Services: l.services,
      Crew: crewLabel(job),
      BookingStatus: job.kind === "booked" ? "Confirmed" : "Not Confirmed",
      StatusColor: job.kind === "booked" ? "#15803D" : "#D97706",
      BookingNo: job.reference,
      StairFlights: String(l.stairFlights),
      Hours: l.hours === null ? "" : String(l.hours),
      RateHr: l.rateHr === null ? "" : money(l.rateHr),
      DaysUntilMove: daysUntil(job.movingDate, today),
      Labour: money(l.labour),
      CallOut: money(l.callOut),
      Packing: money(l.packing),
      Stair: money(l.stair),
      Adjustment: money(l.adjustment),
      Subtotal: money(l.subtotal),
      GST: money(l.gst),
      Total: money(l.total),
    },
  };
}

export function appsScriptSender(config: { url: string; secret: string; today: () => string }, fetchImpl: typeof fetch = fetch): PdfSender {
  return async (job) => {
    try {
      // The web app answers a POST with a redirect to its result; fetch follows it.
      const res = await fetchImpl(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appsScriptPayload(job, config.today(), config.secret)),
        redirect: "follow",
        signal: AbortSignal.timeout(50_000),
      });
      if (!res.ok) {
        console.error("PDF quote: Apps Script returned", res.status);
        return false;
      }
      const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!out?.ok) console.error("PDF quote: Apps Script said", out?.error ?? "no ok");
      return Boolean(out?.ok);
    } catch (err) {
      console.error("PDF quote: Apps Script unreachable", err instanceof Error ? err.name : "");
      return false;
    }
  };
}

/** The fallback: the same figures as a plain email, when the PDF can't be made. */
export function renderPlainQuoteEmail(job: PdfQuoteJob): EmailContent {
  const l = job.lines;
  const rows: [string, string][] = [
    ["Reference", job.reference],
    ["Date", [pdfDate(job.movingDate), job.arrivalTime ? `arrival ${formatArrivalTime(job.arrivalTime)}` : ""].filter(Boolean).join(", ")],
    ["From", job.from],
    ["To", job.toAddress],
    ["Truck & crew", crewLabel(job)],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  const lineRows: [string, number][] = [
    [l.rateHr !== null && l.hours !== null ? `Labour (${l.hours} h x $${money(l.rateHr)})` : "Labour", l.labour],
    ["Call-out", l.callOut],
    ["Packing materials", l.packing],
    [`Stairs (${l.stairFlights} flights)`, l.stair],
    ["Discount / adjustment", l.adjustment],
    ["Subtotal (excl. GST)", l.subtotal],
    ["GST", l.gst],
  ].filter(([, v], i) => i >= 5 || v !== 0) as [string, number][];
  const intro = introLines(job);

  const text = [
    `Hi ${firstName(job.customerName)},`,
    "",
    ...intro.flatMap((p) => [p, ""]),
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...lineRows.map(([k, v]) => `${k}: $${money(v)}`),
    `Total (GST included): ${formatAud(l.total)}`,
    "",
    `Questions? Reply to this email or call ${site.phone.display}.`,
    "",
    site.name,
  ].join("\n");

  const html = shell(`
<p style="margin:0 0 14px">Hi ${esc(firstName(job.customerName))},</p>
${intro.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("")}
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join("")}</table>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px;min-width:320px">${lineRows
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6b7c">${esc(k)}</td><td style="padding:3px 0;text-align:right">$${money(v)}</td></tr>`)
    .join("")}
<tr><td style="padding:6px 14px 3px 0;font-weight:bold;color:${NAVY}">Total (GST included)</td><td style="padding:6px 0 3px;text-align:right;font-weight:bold;color:${NAVY}">${esc(formatAud(l.total))}</td></tr></table>
<p style="margin:0">Questions? Reply to this email or call <a href="${esc(site.phone.href)}">${esc(site.phone.display)}</a>.</p>`);

  const subject = `${job.testMode ? "[TEST] " : ""}${job.kind === "booked" ? `Your move is booked (ref ${job.reference})` : `Your Blue Line Removals quote (ref ${job.reference})`}`;
  return { subject, text, html };
}
