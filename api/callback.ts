import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

// Same Resend setup as api/quote.ts (RESEND_API_KEY + LEAD_FROM_EMAIL in the
// Vercel dashboard). The inbox comes from LEAD_TO_EMAIL when it's set there,
// so switching both forms to BLR's own inbox is a dashboard change + redeploy,
// no code edit. Kept self-contained rather than importing a shared module:
// with "type": "module", Vercel's per-file function build doesn't reliably
// resolve extensionless relative imports.
//
// SMS (Dialpad) is not wired up yet -- it's waiting on the client's API key
// and sending/receiving numbers. When it is, send it alongside the email
// below using the same `when` string.
const LEAD_TO_EMAIL = process.env.LEAD_TO_EMAIL || "qamiraconsulting@gmail.com";
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^[+()\-.\s\d]{8,20}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Must match the windows offered in src/components/layout/CallbackModal.tsx.
const WINDOWS: Record<string, string> = {
  morning: "Morning 8am–12pm",
  afternoon: "Afternoon 12pm–5pm",
  evening: "Evening 5pm–7pm",
};

const MELBOURNE = "Australia/Melbourne";

function truncate(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Today's date in Melbourne as YYYY-MM-DD (en-CA formats dates that way).
function melbourneToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MELBOURNE }).format(new Date());
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// e.g. "Tomorrow (Fri 9 Oct), Morning 8am–12pm"
function describeWhen(date: string, windowKey: string): string {
  const offset = daysBetween(melbourneToday(), date);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
      .formatToParts(new Date(`${date}T00:00:00Z`))
      .map((part) => [part.type, part.value]),
  );
  const day = `${p.weekday} ${p.day} ${p.month}`;
  const relative = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : "";
  return `${relative ? `${relative} (${day})` : day}, ${WINDOWS[windowKey]}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.LEAD_FROM_EMAIL) {
    res.status(500).json({ error: "The callback form isn't configured yet. Please call us directly instead." });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Honeypot: a field real visitors never see. Bots that fill it get a normal
  // success response but nothing is sent.
  if (truncate(body?.company, 200)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = truncate(body?.name, 200);
  const email = truncate(body?.email, 320);
  const phone = truncate(body?.phone, 50);
  const date = truncate(body?.date, 10);
  const windowKey = truncate(body?.window, 20);

  if (!name || !email || !phone || !date || !windowKey) {
    res.status(400).json({ error: "Please fill in every field." });
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  if (!PHONE_PATTERN.test(phone) || phone.replace(/\D/g, "").length < 8) {
    res.status(400).json({ error: "Enter a valid contact number." });
    return;
  }

  // -1 tolerates a visitor whose clock is just past midnight before Melbourne's.
  const offset = DATE_PATTERN.test(date) ? daysBetween(melbourneToday(), date) : NaN;
  if (!(offset >= -1 && offset <= 62) || !(windowKey in WINDOWS)) {
    res.status(400).json({ error: "Choose a suitable day and time." });
    return;
  }

  const when = describeWhen(date, windowKey);
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: `Blue Line Removals Website <${process.env.LEAD_FROM_EMAIL}>`,
      to: [LEAD_TO_EMAIL],
      replyTo: `${name} <${email}>`,
      subject: `Callback request from ${name} — ${when}`,
      text: [
        "New callback request from the website.",
        "",
        `Name: ${name}`,
        `Contact number: ${phone}`,
        `Email: ${email}`,
        `Suitable time: ${when} (Melbourne time)`,
      ].join("\n"),
    });

    if (error) {
      console.error("Callback request send failed:", error);
      res.status(502).json({ error: "We couldn't send that just now. Please call us instead." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Callback request send failed:", err);
    res.status(502).json({ error: "We couldn't send that just now. Please call us instead." });
  }
}
