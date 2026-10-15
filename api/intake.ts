import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { parseTeamForm, saveTeamFormJob } from "../src/server/intake/teamForm.js";

// Matt's Google Form -> Neon. Called by one extra step at the end of his Apps Script
// (docs/apps-script/blr-website-additions.gs) after the quote email has gone, with the shared
// secret in the x-blr-secret header (APPS_SCRIPT_SECRET here, BLR_SHARED_SECRET in the script's
// Script Properties). See src/server/intake/teamForm.ts for what's recorded.

const bodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
  values: z.record(z.string(), z.unknown()),
  moveDateIso: z.string().nullable().optional(),
  arrivalTime: z.string().nullable().optional(),
});

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  const expected = process.env.APPS_SCRIPT_SECRET;
  if (!expected || !process.env.DATABASE_URL) {
    res.status(500).json({ ok: false, error: "Intake isn't configured yet." });
    return;
  }
  if (!secretMatches(req.headers["x-blr-secret"], expected)) {
    res.status(401).json({ ok: false, error: "Not allowed." });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "That doesn't look like a Google Form row." });
    return;
  }
  const job = parseTeamForm(parsed.data);
  if (!job.ok) {
    res.status(400).json(job);
    return;
  }

  try {
    res.status(200).json(await saveTeamFormJob(job.job));
  } catch (err) {
    console.error("Intake failed:", err instanceof Error ? err.message : "unknown error");
    res.status(502).json({ ok: false, error: "Couldn't save that row just now." });
  }
}
