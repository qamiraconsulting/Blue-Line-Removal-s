import { site } from "../../data/site.js";

// Last line of defence after the model writes a reply. The prompt already forbids this;
// the guard makes it impossible for a customer to SEE a price that the engine didn't
// produce, or any talk of hourly rates / call-out fees, even if the model slips.

const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g;
const RATE_TALK = /per[- ]hour|\/\s?h(?:ou)?r\b|hourly|call[- ]?out|travel (?:fee|charge)|minimum (?:of )?\d+ hours?/i;

export const BLOCKED_REPLY =
  `Sorry, I can't give a figure like that here. The only price I can give is one flat price worked out for your ` +
  `exact move, with everything included. I'm happy to work that out for you, or you can call us on ${site.phone.display}.`;

export type GuardResult = { ok: true; text: string } | { ok: false; text: string; reason: "unquoted_amount" | "rate_talk" };

/** `quotedAmounts` = every amountAud get_quote returned in this conversation. */
export function guardReply(text: string, quotedAmounts: readonly number[]): GuardResult {
  if (RATE_TALK.test(text)) return { ok: false, text: BLOCKED_REPLY, reason: "rate_talk" };
  for (const match of text.matchAll(DOLLARS)) {
    const amount = Number(match[1]!.replace(/,/g, ""));
    const cents = /\.\d/.test(match[0]) && !/\.0+$/.test(match[0]);
    if (cents || !quotedAmounts.includes(amount)) return { ok: false, text: BLOCKED_REPLY, reason: "unquoted_amount" };
  }
  return { ok: true, text };
}
