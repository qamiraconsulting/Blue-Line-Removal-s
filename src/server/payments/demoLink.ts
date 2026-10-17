// A DUMMY deposit payment link, used only until Stripe is connected (Ayesha, 2026-10-17: "finish
// the full UI and flow using the dummy link, so we can only swap in the real link once Stripe
// is ready").
//
// It opens Blue Line's own demo payment page (src/pages/Deposit.tsx, status=demo) which takes no
// money and confirms nothing. To go live, do NOTHING here: add STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET in Vercel and every booking gets its own real Stripe link instead -- the
// demo link is only used when Stripe is NOT configured.
//
// It is never offered on the live site (VERCEL_ENV=production): a real customer must not be sent
// to a pretend payment page. There, with no Stripe, they are told the team will send a link.

export function demoDepositLink(siteUrl: string, reference: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/deposit?status=demo&ref=${encodeURIComponent(reference)}`;
}

/** The demo-link maker for this environment, or undefined when it must not be used. */
export function demoDepositLinkFor(
  env: Record<string, string | undefined>,
  siteUrl: string,
  stripeConfigured: boolean,
): ((reference: string) => string) | undefined {
  if (stripeConfigured || env.VERCEL_ENV === "production") return undefined;
  return (reference) => demoDepositLink(siteUrl, reference);
}
