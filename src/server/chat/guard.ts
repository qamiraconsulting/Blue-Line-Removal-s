import { site } from "../../data/site.js";
import { DEPOSIT_AUD } from "../quote/deposit.js";

// Last line of defence after the model writes a reply. The prompt already forbids this;
// the guard makes it impossible for a customer to SEE a price that the engine didn't
// produce, or any talk of hourly rates / call-out fees, even if the model slips.

const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g;
const RATE_TALK = /per[- ]hour|\/\s?h(?:ou)?r\b|hourly|call[- ]?out|travel (?:fee|charge)|minimum (?:of )?\d+ hours?/i;

export const BLOCKED_REPLY =
  `Sorry, I can't give a figure like that here. The only figure I can give is an estimate worked out for your ` +
  `move from the details you share. I'm happy to work that out for you, or you can call us on ${site.phone.display}.`;

const LINKS = /https?:\/\/[^\s<>"]+/gi;
const ALLOWED_LINK = /^https:\/\/(checkout\.stripe\.com\/|(www\.)?bluelineremovals\.com\.au(\/|$|[?#]))/i;

export const LINK_BLOCKED_REPLY = `Sorry, I couldn't share that link. Your secure payment link is in the email we sent you, or call us on ${site.phone.display} and we'll help.`;

export type GuardResult = { ok: true; text: string } | { ok: false; text: string; reason: "unquoted_amount" | "rate_talk" | "unknown_link" };

/**
 * `quotedAmounts` = every amountAud get_quote returned in this conversation. The fixed booking
 * deposit (DEPOSIT_AUD) is the only other figure the chat may state.
 */
export function guardReply(text: string, quotedAmounts: readonly number[]): GuardResult {
  if (RATE_TALK.test(text)) return { ok: false, text: BLOCKED_REPLY, reason: "rate_talk" };
  // The chat shows https links as clickable, so only Blue Line's own site and Stripe's payment
  // pages may appear -- a made-up or mistyped "payment link" never reaches a customer.
  for (const match of text.matchAll(LINKS)) {
    if (!ALLOWED_LINK.test(match[0])) return { ok: false, text: LINK_BLOCKED_REPLY, reason: "unknown_link" };
  }
  for (const match of text.matchAll(DOLLARS)) {
    const amount = Number(match[1]!.replace(/,/g, ""));
    const cents = /\.\d/.test(match[0]) && !/\.0+$/.test(match[0]);
    const allowed = quotedAmounts.includes(amount) || amount === DEPOSIT_AUD;
    if (cents || !allowed) return { ok: false, text: BLOCKED_REPLY, reason: "unquoted_amount" };
  }
  return { ok: true, text };
}
