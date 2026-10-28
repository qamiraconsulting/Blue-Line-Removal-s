import { Resend } from "resend";
import { site } from "../../data/site.js";
import { appsScriptSender } from "../jobs/pdfQuote.js";
import { dbCustomerNoticeStore, syncCustomerNoticeSafely } from "../notify/customerNotice.js";
import { dbDriverNoticeStore, syncDriverNoticeSafely } from "../notify/driverNotice.js";
import { sendDueNotices } from "../notify/dueNotices.js";
import { demoDepositLinkFor } from "../payments/demoLink.js";
import { dbDepositStore, siteUrlFrom } from "../payments/depositPayment.js";
import { dbNoDriverStore, DEFAULT_DISPATCH_ALERT_EMAIL } from "../notify/noDriverAlert.js";
import { stripeConfigFrom } from "../payments/stripe.js";
import { getActiveRateCard } from "./rateCard.js";
import { melbourneToday, type OutgoingEmail, type QuoteServiceDeps } from "./service.js";
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
// team inbox -- Blue Line's hello@ (Ayesha, 2026-10-15) unless set otherwise.
// APPS_SCRIPT_URL + APPS_SCRIPT_SECRET: the branded PDF quote (see src/server/jobs/pdfQuote.ts).
// TEST_EMAIL_REDIRECT (previews only): where test-mode customer emails go.
// STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET: the booking deposit (src/server/payments).

export type Env = Record<string, string | undefined>;

/** Returns null when email isn't configured -- without it a lead could be lost. */
export function buildQuoteDeps(env: Env = process.env): QuoteServiceDeps | null {
  if (!env.RESEND_API_KEY || !env.LEAD_FROM_EMAIL) return null;

  const resend = new Resend(env.RESEND_API_KEY);
  const fromAddress = env.LEAD_FROM_EMAIL;

  const sendEmail = async (email: OutgoingEmail): Promise<boolean> => {
    try {
      const { error } = await resend.emails.send({
        from: `${email.kind === "customer" ? site.name : email.kind === "driver" ? `${site.name} Jobs` : `${site.name} Website`} <${fromAddress}>`,
        to: [email.to],
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.attachments?.length ? { attachments: email.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) } : {}),
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
  const testEmailTo = env.VERCEL_ENV !== "production" ? env.TEST_EMAIL_REDIRECT || null : null;
  // The booking deposit's payment pages (src/server/payments). Unset = the team sends a link.
  const stripe = stripeConfigFrom(env);

  // Driver and customer day-before emails (src/server/notify). Previews never email real people.
  const nonProduction = env.VERCEL_ENV !== "production";
  const driverNotice = { store: dbDriverNoticeStore, sendEmail, replyTo: site.email, testEmailTo, nonProduction };
  const customerNotice = { store: dbCustomerNoticeStore, sendEmail, replyTo: site.email, testEmailTo, nonProduction };
  // A job with no driver 2 days before the move (Blue Line, 28 Oct). Previews alert the test inbox.
  const noDriver = {
    store: dbNoDriverStore,
    sendEmail,
    to: (nonProduction && testEmailTo) || env.DISPATCH_ALERT_EMAIL || DEFAULT_DISPATCH_ALERT_EMAIL,
    dashboardUrl: `${siteUrlFrom(env)}/admin/trips`,
  };

  return {
    notifyDriver: databaseConfigured ? (target) => syncDriverNoticeSafely(target, driverNotice) : undefined,
    notifyCustomer: databaseConfigured ? (target) => syncCustomerNoticeSafely(target, customerNotice) : undefined,
    sendDueNotices: databaseConfigured ? () => sendDueNotices({ driver: driverNotice, customer: customerNotice, noDriver }) : undefined,
    rateCard: getActiveRateCard(),
    allowPlaceholderRateCard,
    routes: env.GOOGLE_MAPS_SERVER_KEY ? { apiKey: env.GOOGLE_MAPS_SERVER_KEY } : null,
    cache: databaseConfigured ? dbDistanceCache : undefined,
    store: databaseConfigured ? dbQuoteStore : undefined,
    sendEmail,
    teamEmail: env.LEAD_TO_EMAIL ?? site.email,
    customerReplyTo: site.email,
    testEmailTo,
    deposits: stripe && databaseConfigured ? { stripe, store: dbDepositStore, siteUrl: siteUrlFrom(env) } : undefined,
    // No Stripe yet: a dummy payment page (previews and local only) so the whole flow can be tried.
    demoDepositLink: databaseConfigured ? demoDepositLinkFor(env, siteUrlFrom(env), Boolean(stripe)) : undefined,
    pdf:
      env.APPS_SCRIPT_URL && env.APPS_SCRIPT_SECRET
        ? appsScriptSender({ url: env.APPS_SCRIPT_URL, secret: env.APPS_SCRIPT_SECRET, today: () => melbourneToday(new Date()) })
        : undefined,
  };
}
