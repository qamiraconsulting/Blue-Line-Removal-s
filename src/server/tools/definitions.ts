import { z } from "zod";
import type { ToolDefinition } from "../providers/llm/LLMProvider.js";

// The nine tools from architecture doc Section 11. Each description is
// written prescriptively ("call this when...") rather than just
// descriptively -- current Claude models trigger tools more conservatively
// than older ones, so the trigger condition needs to live in the schema,
// not be left implicit in the system prompt alone.
//
// Zod is the single source of truth (architecture doc Section 3): these
// schemas feed HTTP validation, the Anthropic tool input_schema below via
// zodToJsonSchema, and TypeScript types via z.infer, instead of three
// hand-maintained copies drifting apart.

export const validateAddressInput = z.object({
  rawAddress: z.string().min(3).describe("The address text exactly as the customer typed it."),
});

export const geocodeAddressInput = z.object({
  placeId: z.string().describe("A place_id returned by validate_address's suggestions."),
});

export const calculateRouteInput = z.object({
  originLat: z.number(),
  originLng: z.number(),
  destinationLat: z.number(),
  destinationLng: z.number(),
});

export const calculateMoveEstimateInput = z.object({
  inventory: z
    .array(
      z.object({
        itemCategory: z.string(),
        quantity: z.number().int().positive(),
        heavyItem: z.boolean().optional(),
      }),
    )
    .describe("Items the customer has described, in the categories the Move Complexity Engine recognises."),
  propertyType: z.string(),
  bedrooms: z.number().int().nonnegative(),
  pickupFloor: z.number().int(),
  pickupLift: z.boolean(),
  pickupStairs: z.boolean(),
  destinationFloor: z.number().int(),
  destinationLift: z.boolean(),
  destinationStairs: z.boolean(),
  longCarry: z.boolean(),
  restrictedParking: z.boolean(),
  packingRequired: z.boolean(),
  distanceKm: z.number().nonnegative(),
  travelMinutes: z.number().nonnegative(),
});

export const calculatePriceInput = z.object({
  truckTierId: z.string(),
  crewSize: z.number().int().positive(),
  durationMinutes: z.number().positive(),
  movingDate: z.string().describe("ISO date, e.g. 2026-09-15."),
  pickupAddressFormatted: z
    .string()
    .describe("The geocoded pickup address -- used to work out the call-out fee from the truck's last location."),
  stairsFlights: z.number().int().nonnegative(),
  heavyItemCount: z.number().int().nonnegative(),
  pianoMoving: z.boolean(),
  longCarry: z.boolean(),
  packingRequired: z.boolean(),
});

export const createLeadInput = z.object({
  customerName: z.string(),
  phone: z.string(),
  email: z.string().email(),
  pickupAddressFormatted: z.string(),
  destinationAddressFormatted: z.string(),
  movingDate: z.string(),
  movingTime: z.string().optional(),
  propertyType: z.string().optional(),
  bedrooms: z.number().int().optional(),
  specialItems: z.string().optional(),
});

export const updateLeadInput = z.object({
  leadId: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()).describe("Partial fields being changed, e.g. a corrected address."),
});

export const createQuoteInput = z.object({
  leadId: z.string().uuid(),
});

export const requestHumanFollowupInput = z.object({
  leadId: z.string().uuid().optional().describe("May be absent if the customer hasn't been captured as a lead yet."),
  reason: z
    .string()
    .describe(
      "Why this needs a human -- e.g. 'customer asked for a call', 'piano', 'price pushback', 'address won't resolve'.",
    ),
});

function toolFrom(name: string, description: string, schema: z.ZodType): ToolDefinition {
  return {
    name,
    description,
    // Zod v4 ships JSON Schema conversion natively -- one schema definition
    // feeds HTTP validation, this tool input_schema, and TypeScript types
    // via z.infer, per the architecture doc's Section 3 design.
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>,
  };
}

export const toolDefinitions: ToolDefinition[] = [
  toolFrom(
    "validate_address",
    "Call this whenever the customer gives a pickup or destination address, before anything else uses it. " +
      "Returns whether it resolves and a list of Google Places suggestions to disambiguate.",
    validateAddressInput,
  ),
  toolFrom(
    "geocode_address",
    "Call this after the customer confirms which suggestion from validate_address is correct, to get the " +
      "normalised address, coordinates, and locality details.",
    geocodeAddressInput,
  ),
  toolFrom(
    "calculate_route",
    "Call this once both pickup and destination are geocoded, to get the real driving distance and duration " +
      "between them. Never estimate this yourself.",
    calculateRouteInput,
  ),
  toolFrom(
    "calculate_move_estimate",
    "Call this once inventory and access details are collected, to get the recommended truck, crew size, and " +
      "estimated job duration. Runs the Move Complexity Engine -- never estimate duration yourself.",
    calculateMoveEstimateInput,
  ),
  toolFrom(
    "calculate_price",
    "Call this after calculate_move_estimate, to get the only dollar figures you may ever state to the " +
      "customer. Never state a price that didn't come from this tool's result.",
    calculatePriceInput,
  ),
  toolFrom(
    "create_lead",
    "Call this once you have the customer's name, phone, and email, to save the enquiry. Returns a lead_id.",
    createLeadInput,
  ),
  toolFrom(
    "update_lead",
    "Call this when the customer changes an earlier answer -- e.g. a different pickup address -- rather than " +
      "silently patching the running estimate.",
    updateLeadInput,
  ),
  toolFrom(
    "create_quote",
    "Call this only when explicitly transitioning a lead from an estimate to a formal quotation -- never as " +
      "part of just presenting an estimate in chat.",
    createQuoteInput,
  ),
  toolFrom(
    "request_human_followup",
    "Call this whenever the customer explicitly asks for a person, mentions a piano or other special/heavy " +
      "item, pushes back on the price, or you are uncertain about anything outside this playbook's scope. " +
      "Escalations route to Blue Line's internal dashboard with a WhatsApp alert -- never promise the customer " +
      "an immediate callback time you can't guarantee.",
    requestHumanFollowupInput,
  ),
];
