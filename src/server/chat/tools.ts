import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { handleQuoteRequest, personalQuoteReasons, propertySizeIds, truckChoices, type QuoteServiceDeps } from "../quote/service.js";
import { availabilityForQuote, requestBooking, type BookingStore } from "../quote/booking.js";
import { renderHandoffEmail } from "./handoffEmail.js";
import type { LeadStore } from "./leadStore.js";

// The chat has exactly two tools. get_quote runs the SAME flow as the website quote form
// (handleQuoteRequest): same validation, same Google distances, same rate card, same
// first-move check, same stored quote and same emails. The model never sees an hourly
// rate, a call-out figure or the internal breakdown -- only what the form's result card
// shows the customer.

export const getQuoteInput = z.object({
  name: z.string().min(1).describe("Customer's name."),
  phone: z.string().min(6).describe("Customer's phone number, as they gave it."),
  email: z.string().min(3).describe("Customer's email address -- the quote is emailed here."),
  need: z.enum(["moving", "junk"]).describe("'moving' for a house/unit/office move, 'junk' for junk removal."),
  from: z.string().describe("Pickup suburb or address, as the customer gave it (empty for junk removal if not given)."),
  to: z.string().describe("Drop-off suburb or address, as the customer gave it."),
  date: z.string().describe("Moving date as YYYY-MM-DD. Work relative dates out from today's date in your instructions."),
  propertySize: z
    .enum(propertySizeIds)
    .describe("Home size: studio_1bed, 2_bed, 3_bed, 4plus_bed; commercial for an office; unsure if the customer doesn't know."),
  truck: z
    .enum(truckChoices)
    .optional()
    .describe("Only if the customer chose a truck: 4.5T, 6-8T or 10T -- or 'inspect' if they want the team to inspect and confirm. Leave out if they want Blue Line's suggestion."),
  movers: z
    .union([z.literal(2), z.literal(3), z.literal(4)])
    .optional()
    .describe("Only if the customer chose a crew size: 2, 3 or 4 movers. Leave out if they want Blue Line's suggestion or chose 'inspect'."),
  accessNotes: z
    .string()
    .max(1000)
    .describe("What the customer said about stairs, parking distance from the door and heavy items, in their words. Empty if nothing."),
  firstMove: z.boolean().describe("True only if the customer said this is their first move with Blue Line."),
  specialItems: z.boolean().describe("True if there's a piano, pool table, safe, spa or similar specialist item."),
});

export const requestPersonalQuoteInput = z.object({
  name: z.string().min(1).describe("Customer's name."),
  phone: z.string().min(6).describe("Customer's phone number, as they gave it."),
  email: z.string().min(3).describe("Customer's email address."),
  need: z.enum(["moving", "junk"]).describe("'junk' for junk removal, otherwise 'moving'."),
  description: z
    .string()
    .min(3)
    .max(1000)
    .describe("What's being moved and anything the team must know (e.g. '3-4 boxes, must arrive before 3pm'), in the customer's words."),
  from: z.string().describe("Pickup suburb or address (empty if not given)."),
  to: z.string().describe("Drop-off suburb or address (empty if not given)."),
  date: z.string().describe("YYYY-MM-DD if they gave a date, else empty."),
  reason: z
    .enum(personalQuoteReasons)
    .describe(
      "Why this needs the team: small_load (a few boxes/single items, not a home move), specialist_item, junk_removal, office_move, outside_melbourne, urgent_or_timed (today, or a fixed deadline), packing, other.",
    ),
});

export const requestHumanFollowupInput = z.object({
  reason: z.string().min(1).describe("Short reason, e.g. 'asked for a person', 'packing', 'price pushback', 'piano'."),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  callbackRequested: z.boolean().optional().describe("True if the customer asked for a call back."),
  callbackTime: z.string().optional().describe("When they'd like the call, in their words (e.g. 'tomorrow after 3pm')."),
});

export const checkAvailabilityInput = z.object({
  quoteReference: z.string().min(4).describe("The reference get_quote returned for the estimate."),
});

export const requestBookingInput = z.object({
  quoteReference: z.string().min(4).describe("The reference get_quote returned for the estimate being booked."),
  arrivalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("HH:MM -- only one of the availableTimes check_availability returned. Leave out if none were offered."),
  agreedToTerms: z
    .literal(true)
    .describe("Only true after you showed the customer the booking terms word for word and they clearly said yes."),
  notes: z.string().max(500).optional().describe("Anything they asked for -- e.g. a preferred arrival time when no times were offered."),
});

const tool = (name: string, description: string, schema: z.ZodType): Anthropic.Beta.Messages.BetaTool => ({
  name,
  description,
  input_schema: z.toJSONSchema(schema) as Anthropic.Beta.Messages.BetaTool.InputSchema,
});

export const chatTools: Anthropic.Beta.Messages.BetaTool[] = [
  tool(
    "get_quote",
    "Works out Blue Line's estimate for a job and emails it to the customer. Call this ONLY after you " +
      "have every field, have read the details back to the customer and they have confirmed them. Call it again " +
      "if they change any detail. The amountAud in its result is the ONLY dollar figure you may ever give.",
    getQuoteInput,
  ),
  tool(
    "request_personal_quote",
    "Sends a job that needs a personal quote to the Blue Line team (a few boxes or single items, junk, an office, a " +
      "piano or similar, packing, outside metropolitan Melbourne, today or a fixed deadline). Needs only the job " +
      "description, addresses, date and contact details -- never ask estimate questions for these jobs. Call it once " +
      "the customer has confirmed the details.",
    requestPersonalQuoteInput,
  ),
  tool(
    "check_availability",
    "Shows which arrival times are free on the estimate's moving date, and whether booking one would be confirmed " +
      "on the spot. Call it when the customer wants to book, before showing the booking terms.",
    checkAvailabilityInput,
  ),
  tool(
    "request_booking",
    "Books an estimate from get_quote -- confirmed on the spot or as a request for the team (see status in the " +
      "result). Call ONLY after you have shown the customer the " +
      "booking terms word for word and they have clearly agreed. Never call it for a personal quote, and never if " +
      "they hesitate -- offer the team, a call back or the phone number instead.",
    requestBookingInput,
  ),
  tool(
    "request_human_followup",
    "Flags this chat for a Blue Line team member. Call when the customer asks for a person, pushes back on " +
      "price, doesn't agree to the booking terms, wants a call back, wants packing, mentions anything you can't " +
      "answer from your instructions, or seems upset. Include any contact details you already have.",
    requestHumanFollowupInput,
  ),
];

/** What a tool run returns: `result` goes to the model; `record` is kept with the message. */
export interface ToolRun {
  result: unknown;
  isError: boolean;
  record: ToolRecord;
}

/** Stored on the assistant message (messages.tool_calls). No internal breakdown. */
export interface ToolRecord {
  name: string;
  quoteReference?: string;
  quotedAmountAud?: number;
  outcome: string;
}

export interface ChatToolDeps {
  /** null when email isn't configured -- the chat then can't quote at all. */
  quoteDeps: QuoteServiceDeps | null;
  leads: LeadStore;
  /** Booking requests on estimates; absent when the database isn't configured. */
  bookings?: BookingStore;
  conversationId: string;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

const UNAVAILABLE = {
  ok: false,
  error: "Instant quotes aren't available right now. The team has been asked to follow up with a personal quote.",
};

export function createToolRunner(deps: ChatToolDeps) {
  const log = deps.log ?? ((message, meta) => console.error(message, meta ?? ""));

  // Lead bookkeeping must never break the customer's chat.
  // Returns whether the chat was already flagged (null if the store failed).
  const touchLead = async (patch: Parameters<LeadStore["upsertForConversation"]>[1]): Promise<boolean | null> => {
    try {
      return (await deps.leads.upsertForConversation(deps.conversationId, patch)).wasFlagged;
    } catch (err) {
      log("lead update failed", { err: String(err) });
      return null;
    }
  };

  return async function runTool(name: string, rawInput: unknown): Promise<ToolRun> {
    if (name === "get_quote") {
      const parsed = getQuoteInput.safeParse(rawInput);
      if (!parsed.success) {
        return {
          result: { ok: false, error: `Missing or invalid details: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` },
          isError: true,
          record: { name, outcome: "invalid_input" },
        };
      }
      const input = parsed.data;
      const contact = { customerName: input.name, phone: input.phone, email: input.email, fromText: input.from, toText: input.to };

      if (!deps.quoteDeps) {
        await touchLead({ ...contact, humanFollowupRequired: true, notes: "Chat couldn't quote: quote service not configured" });
        return { result: UNAVAILABLE, isError: false, record: { name, outcome: "service_unavailable" } };
      }

      const res = await handleQuoteRequest(input, deps.quoteDeps, { source: "chatbot", conversationId: deps.conversationId });
      if (!res.body.ok) {
        return { result: { ok: false, error: res.body.error }, isError: false, record: { name, outcome: `error_${res.status}` } };
      }

      const quote = res.body.result;
      if (quote.kind === "manual") {
        await touchLead({ ...contact, quoteReference: quote.reference, humanFollowupRequired: true, notes: "Quote needs a person -- see the team email" });
        return { result: { ok: true, ...quote }, isError: false, record: { name, quoteReference: quote.reference, outcome: "manual" } };
      }

      await touchLead({ ...contact, quoteReference: quote.reference });
      return {
        result: { ok: true, ...quote },
        isError: false,
        record: { name, quoteReference: quote.reference, quotedAmountAud: quote.amountAud, outcome: quote.testMode ? "priced_test" : "priced" },
      };
    }

    if (name === "request_personal_quote") {
      const parsed = requestPersonalQuoteInput.safeParse(rawInput);
      if (!parsed.success) {
        return {
          result: { ok: false, error: `Missing or invalid details: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` },
          isError: true,
          record: { name, outcome: "invalid_input" },
        };
      }
      const { description, reason, ...job } = parsed.data;
      const contact = { customerName: job.name, phone: job.phone, email: job.email, fromText: job.from, toText: job.to };
      if (!deps.quoteDeps) {
        await touchLead({ ...contact, humanFollowupRequired: true, notes: `Personal quote (${reason}): ${description}` });
        return { result: UNAVAILABLE, isError: false, record: { name, outcome: "service_unavailable" } };
      }
      const res = await handleQuoteRequest(job, deps.quoteDeps, {
        source: "chatbot",
        conversationId: deps.conversationId,
        personalQuote: { reason, description },
      });
      if (!res.body.ok) {
        return { result: { ok: false, error: res.body.error }, isError: false, record: { name, outcome: `error_${res.status}` } };
      }
      const quote = res.body.result;
      await touchLead({ ...contact, quoteReference: quote.reference, humanFollowupRequired: true, notes: `Personal quote (${reason}): ${description}` });
      return {
        result: { ok: true, kind: "personal_quote", reference: quote.reference, emailed: quote.emailed },
        isError: false,
        record: { name, quoteReference: quote.reference, outcome: "personal_quote" },
      };
    }

    if (name === "check_availability") {
      const parsed = checkAvailabilityInput.safeParse(rawInput);
      if (!parsed.success || !deps.bookings || !deps.quoteDeps) {
        return {
          result: { ok: true, onlineBookingOpen: false, why: "Online arrival times aren't available -- take a booking request with their preferred time in notes.", availableTimes: [], instantConfirm: false },
          isError: false,
          record: { name, outcome: "not_available" },
        };
      }
      const availability = await availabilityForQuote(
        { reference: parsed.data.quoteReference, conversationId: deps.conversationId },
        { ...deps.quoteDeps, bookings: deps.bookings },
      );
      return {
        result: availability,
        isError: false,
        record: { name, quoteReference: parsed.data.quoteReference, outcome: availability.ok ? (availability.onlineBookingOpen ? "times_offered" : "no_online_times") : availability.reason },
      };
    }

    if (name === "request_booking") {
      const parsed = requestBookingInput.safeParse(rawInput);
      if (!parsed.success) {
        return {
          result: { ok: false, error: "A booking needs the estimate reference and the customer's clear agreement to the booking terms." },
          isError: true,
          record: { name, outcome: "invalid_input" },
        };
      }
      if (!deps.bookings || !deps.quoteDeps) {
        await touchLead({ humanFollowupRequired: true, notes: `Wants to book ${parsed.data.quoteReference} -- booking service unavailable` });
        return {
          result: { ok: false, error: "Online booking isn't available right now. The team has been asked to call the customer to book." },
          isError: false,
          record: { name, quoteReference: parsed.data.quoteReference, outcome: "service_unavailable" },
        };
      }
      const booking = await requestBooking(
        { reference: parsed.data.quoteReference, conversationId: deps.conversationId, notes: parsed.data.notes, arrivalTime: parsed.data.arrivalTime },
        { ...deps.quoteDeps, bookings: deps.bookings },
      );
      if (booking.ok && booking.status === "requested") {
        await touchLead({ quoteReference: booking.reference, humanFollowupRequired: true, notes: "Booking request -- confirm with the customer" });
      }
      if (booking.ok && booking.status === "confirmed") {
        await touchLead({ quoteReference: booking.reference, notes: "Booked in the chat (confirmed instantly)" });
      }
      return {
        result: booking,
        isError: false,
        record: { name, quoteReference: parsed.data.quoteReference, outcome: booking.ok ? `booking_${booking.status}` : `booking_${booking.reason}` },
      };
    }

    if (name === "request_human_followup") {
      const parsed = requestHumanFollowupInput.safeParse(rawInput);
      const input = parsed.success ? parsed.data : { reason: "unspecified" };
      const wasFlagged = await touchLead({
        customerName: input.name,
        phone: input.phone,
        email: input.email,
        fromText: input.from,
        toText: input.to,
        humanFollowupRequired: true,
        notes: "callbackRequested" in input && input.callbackRequested ? `CALL BACK ${input.callbackTime ?? "(no time given)"} -- ${input.reason}` : input.reason,
      });
      // Alert the team once per hand-off -- not again while the chat is still waiting -- but
      // always for a call-back request. If the dashboard store failed, the email is the only
      // record, so always send it then.
      const callback = "callbackRequested" in input && input.callbackRequested === true;
      if ((wasFlagged !== true || callback) && deps.quoteDeps) {
        const alert = renderHandoffEmail({ conversationId: deps.conversationId, ...input });
        const sent = await deps.quoteDeps.sendEmail({ ...alert, to: deps.quoteDeps.teamEmail, kind: "team" }).catch(() => false);
        if (!sent) log("hand-off email failed", { conversationId: deps.conversationId });
      }
      return { result: { ok: true, acknowledged: true }, isError: false, record: { name, outcome: input.reason } };
    }

    return { result: { ok: false, error: `Unknown tool ${name}` }, isError: true, record: { name, outcome: "unknown_tool" } };
  };
}
