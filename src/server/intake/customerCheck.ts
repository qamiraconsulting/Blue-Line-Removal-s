import { z } from "zod";
import { findPreviousMove, type PreviousMove, type PreviousMoveQuery } from "../customers/previousMove.js";
import { getActiveRateCard } from "../quote/rateCard.js";

// Matt's Google Form, BEFORE the quote PDF is made: "has this customer moved with us before?"
// His Apps Script (docs/apps-script/blr-first-booking-offer.gs) posts the customer's email and
// phone here; the answer decides whether the 10% first-booking discount goes on the quote. The
// script handles the rest (Matt's override, platform jobs, what to do if this can't be reached).

export const customerCheckSchema = z.object({
  action: z.literal("customerCheck"),
  email: z.string().max(320).default(""),
  phone: z.string().max(50).default(""),
  /** The sheet's booking number for this job (BLRddmmyyNN). */
  bookingNo: z.string().max(40).optional(),
  /** The website/chat reference Matt typed, if he is quoting a website request. */
  linkedReference: z.string().max(40).optional(),
  moveDateIso: z.string().max(10).optional(),
});

export type CustomerCheckRequest = z.infer<typeof customerCheckSchema>;

export interface CustomerCheckResult {
  ok: true;
  customerType: "new" | "returning";
  previousMove: PreviousMove | null;
  discountPercent: number;
}

export async function checkCustomer(
  req: CustomerCheckRequest,
  find: (q: PreviousMoveQuery) => Promise<PreviousMove | null> = findPreviousMove,
): Promise<CustomerCheckResult> {
  const previousMove = await find({
    email: req.email,
    phone: req.phone,
    excludeReferences: [req.bookingNo ?? "", req.linkedReference ?? ""],
    sameJobDate: /^\d{4}-\d{2}-\d{2}$/.test(req.moveDateIso ?? "") ? req.moveDateIso : null,
  });
  return {
    ok: true,
    customerType: previousMove ? "returning" : "new",
    previousMove,
    discountPercent: getActiveRateCard().firstMoveDiscountPercent,
  };
}
