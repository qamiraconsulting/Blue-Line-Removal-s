import { Resend } from "resend";
import { site } from "../../data/site.js";
import { getActiveRateCard } from "./rateCard.js";
import type { OutgoingEmail, QuoteServiceDeps } from "./service.js";
import { dbDistanceCache, dbQuoteStore } from "./store.js";

// The ONE place the real quote dependencies are built from environment variables, shared
// by the website form (api/quote.ts) and the chat (src/server/chat). Both therefore price
// with the same rate card, the same distances, the same first-move check and the same
// emails -- there is no second pricing path.
//
// Every secret is a Vercel environment variable (Project Settings -> Environment
// Variables), never committed. See .env.example.
//
// LEAD_FROM_EMAIL must be an address on a domain verified in Resend. LEAD_TO_EMAIL is the
// team inbox -- a temporary default until the client's real mailbox exists.

export type Env = Record<string, string | undefined>;

/** Returns null when email isn't configured -- without it a lead could be lost. */
export function buildQuoteDeps(env: Env = process.env): QuoteServiceDeps | null {
  if (!env.RESEND_API_KEY || !env.LEAD_FROM_EMAIL) return null;

  const resend = new Resend(env.RESEND_API_KEY);
  const fromAddress = env.LEAD_FROM_EMAIL;

  const sendEmail = async (email: OutgoingEmail): Promise<boolean> => {
    try {
      const { error } = await resend.emails.send({
        from: `${email.kind === "customer" ? site.name : `${site.name} Website`} <${fromAddress}>`,
        to: [email.to],
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) {
        console.error(`${email.kind} email failed:`, error.name); // never log addresses or content
        return false;
      }
      return true;
    } catch {
      console.error(`${email.kind} email failed to send`);
      return false;
    }
  };

  // Placeholder rate cards can only ever price in local dev / previews -- never production.
  const allowPlaceholderRateCard = env.QUOTE_ALLOW_PLACEHOLDER === "true" && env.VERCEL_ENV !== "production";
  const databaseConfigured = Boolean(env.DATABASE_URL);

  return {
    rateCard: getActiveRateCard(),
    allowPlaceholderRateCard,
    routes: env.GOOGLE_MAPS_SERVER_KEY ? { apiKey: env.GOOGLE_MAPS_SERVER_KEY } : null,
    cache: databaseConfigured ? dbDistanceCache : undefined,
    store: databaseConfigured ? dbQuoteStore : undefined,
    sendEmail,
    teamEmail: env.LEAD_TO_EMAIL ?? "qamiraconsulting@gmail.com",
    customerReplyTo: site.email,
  };
}
