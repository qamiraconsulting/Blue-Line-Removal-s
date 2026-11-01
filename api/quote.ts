import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { MAX_JUNK_DETAILS } from "../src/lib/junkPhotos.js";
import { checkJunkPhotos, type RawPhoto } from "./_lib/junkPhotos.js";

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
//
// Junk Removal requests can carry photos (shrunk in the browser, re-checked here by
// api/_lib/junkPhotos.ts) and a "Details of Your Junk" note: the photos go on the team
// email as attachments and are not stored anywhere. Nothing new to configure.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function truncate(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// "Richmond 3121" from the form's suburb and postcode boxes. A page loaded before
// 2026-11-01 still sends one "from"/"to" box, so that's used when the new ones are missing.
function place(suburb: unknown, postcode: unknown, older: unknown): string {
  const joined = [truncate(suburb, 60), truncate(postcode, 20).replace(/\D/g, "").slice(0, 4)].filter(Boolean).join(" ");
  return joined || truncate(older, 200);
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
  const from = place(body?.fromSuburb, body?.fromPostcode, body?.from);
  const to = place(body?.toSuburb, body?.toPostcode, body?.to);
  const date = truncate(body?.date, 50);
  const propertySize = truncate(body?.propertySize, 100);
  const notes = need === "Moving" ? truncate(body?.notes, 1000) : "";
  const junkDetails = need === "Junk Removal" ? truncate(body?.junkDetails, MAX_JUNK_DETAILS) : "";

  if (!name || !phone || !email) {
    res.status(400).json({ error: "Name, phone, and email are required." });
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  // Only Junk Removal sends photos; anything sent with a Moving request is ignored.
  const photos = need === "Junk Removal" && Array.isArray(body?.photos) ? (body.photos as RawPhoto[]) : undefined;
  const photoCheck = checkJunkPhotos(photos);
  if (!photoCheck.ok) {
    res.status(400).json({ error: photoCheck.error });
    return;
  }
  const attachments = photoCheck.attachments;

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
        ...(need === "Junk Removal"
          ? [
              `Preferred date: ${date || "-"}`,
              `Junk details: ${junkDetails || "-"}`,
              `Junk photos: ${attachments.length ? `${attachments.length} attached to this email` : "none sent"}`,
            ]
          : [
              `Moving to: ${to || "-"}`,
              `Preferred date: ${date || "-"}`,
              `Property size: ${propertySize || "-"}`,
              `Additional notes: ${notes || "-"}`,
            ]),
      ].join("\n"),
      ...(attachments.length ? { attachments } : {}),
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
