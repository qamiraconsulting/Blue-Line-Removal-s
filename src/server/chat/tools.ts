import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { handleQuoteRequest, propertySizeIds, type QuoteServiceDeps } from "../quote/service.js";
import type { LeadStore } from "./leadStore.js";

// The chat has exactly two tools. get_quote runs the SAME flow as the website quote form
// (handleQuoteRequest): same validation, same Google distances, same rate card, same
// first-move check, same stored quote and same emails. The model never sees an hourly
// rate, a call-out figure or the internal breakdown -- only what the form's result card
// shows the customer.

const count = (max: number, what: string) => z.number().int().min(0).max(max).describe(what);

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
    .describe("studio_1bed, 2_bed, 3_bed, 4plus_bed (houses/units), commercial (office), unsure (customer doesn't know)."),
  firstMove: z.boolean().describe("True only if the customer said this is their first move with Blue Line."),
  specialItems: z.boolean().describe("True if there's a piano, pool table, safe, spa or similar specialist item."),
  access: z
    .object({
      pickupStairFlights: count(10, "Flights of stairs at the pickup with no lift (0 if none or there's a lift)."),
      dropoffStairFlights: count(10, "Flights of stairs at the drop-off with no lift (0 if none or there's a lift)."),
      longCarry: z.boolean().describe("True if the truck can't park close to the door at either end."),
      heavyItems: count(20, "Number of very heavy single items the customer mentioned."),
    })
    .describe("Access at both ends -- priced into the single flat price, never shown separately."),
});

export const requestHumanFollowupInput = z.object({
  reason: z.string().min(1).describe("Short reason, e.g. 'asked for a person', 'packing', 'price pushback', 'piano'."),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const tool = (name: string, description: string, schema: z.ZodType): Anthropic.Tool => ({
  name,
  description,
  input_schema: z.toJSONSchema(schema) as Anthropic.Tool.InputSchema,
});

export const chatTools: Anthropic.Tool[] = [
  tool(
    "get_quote",
    "Works out Blue Line's single flat price for a job and emails it to the customer. Call this ONLY after you " +
      "have every field, have read the details back to the customer and they have confirmed them. Call it again " +
      "if they change any detail. The amountAud in its result is the ONLY dollar figure you may ever give.",
    getQuoteInput,
  ),
  tool(
    "request_human_followup",
    "Flags this chat for a Blue Line team member. Call when the customer asks for a person, pushes back on " +
      "price, wants packing, mentions anything you can't answer from your instructions, or seems upset. Include " +
      "any contact details you already have.",
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
  const touchLead = async (patch: Parameters<LeadStore["upsertForConversation"]>[1]) => {
    try {
      await deps.leads.upsertForConversation(deps.conversationId, patch);
    } catch (err) {
      log("lead update failed", { err: String(err) });
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

    if (name === "request_human_followup") {
      const parsed = requestHumanFollowupInput.safeParse(rawInput);
      const input = parsed.success ? parsed.data : { reason: "unspecified" };
      await touchLead({
        customerName: input.name,
        phone: input.phone,
        email: input.email,
        fromText: input.from,
        toText: input.to,
        humanFollowupRequired: true,
        notes: input.reason,
      });
      return { result: { ok: true, acknowledged: true }, isError: false, record: { name, outcome: input.reason } };
    }

    return { result: { ok: false, error: `Unknown tool ${name}` }, isError: true, record: { name, outcome: "unknown_tool" } };
  };
}
