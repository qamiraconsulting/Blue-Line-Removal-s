import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

// Server-side only -- RESEND_API_KEY and LEAD_FROM_EMAIL are set in the
// Vercel dashboard under Project Settings -> Environment Variables, never
// committed. LEAD_FROM_EMAIL must be an address on a domain verified in
// Resend -- Blue Line Removals doesn't have its own domain registered yet
// (2026-08-10), so this currently reuses Qamira's verified sending domain
// (same pattern as qamira-web's api/contact.ts) until that changes.
//
// Leads go to LEAD_TO_EMAIL when it's set in the Vercel dashboard (shared
// with api/callback.ts), otherwise to the agency's own inbox -- a temporary
// fallback until the client's real inbox is decided. Changing the env var
// and redeploying switches both forms; no code edit needed.
const LEAD_TO_EMAIL = process.env.LEAD_TO_EMAIL || "qamiraconsulting@gmail.com";
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function truncate(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.LEAD_FROM_EMAIL) {
    res.status(500).json({ error: "The quote form isn't configured yet. Please email us directly instead." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = truncate(body?.name, 200);
  const phone = truncate(body?.phone, 50);
  const email = truncate(body?.email, 320);
  const need = body?.need === "junk" ? "Junk Removal" : "Moving";
  const from = truncate(body?.from, 200);
  const to = truncate(body?.to, 200);
  const date = truncate(body?.date, 50);
  const propertySize = truncate(body?.propertySize, 100);

  if (!name || !phone || !email) {
    res.status(400).json({ error: "Name, phone, and email are required." });
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: `Blue Line Removals Website <${process.env.LEAD_FROM_EMAIL}>`,
      to: [LEAD_TO_EMAIL],
      replyTo: `${name} <${email}>`,
      subject: `New quote request from ${name} (${need})`,
      text: [
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        `Needs help with: ${need}`,
        `Moving from: ${from || "-"}`,
        `Moving to: ${to || "-"}`,
        `Preferred date: ${date || "-"}`,
        `Property size: ${propertySize || "-"}`,
      ].join("\n"),
    });

    if (error) {
      console.error("Quote form send failed:", error);
      res.status(502).json({ error: "We couldn't send that just now. Please email us instead." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Quote form send failed:", err);
    res.status(502).json({ error: "We couldn't send that just now. Please email us instead." });
  }
}
