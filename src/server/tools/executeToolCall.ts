import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { leads } from "../db/schema.js";
import { GoogleMapsProvider } from "../providers/mapping/GoogleMapsProvider.js";
import { calculateMoveComplexity, requiresHumanFollowup } from "../engines/moveComplexityEngine.js";
import { calculatePrice } from "../engines/pricingEngine.js";
import { getTruckStartingLocation } from "../services/truckDispatch.js";
import { getActivePricingConfig, getInventoryRules } from "../services/config.js";
import {
  calculateMoveEstimateInput,
  calculatePriceInput,
  calculateRouteInput,
  createLeadInput,
  geocodeAddressInput,
  requestHumanFollowupInput,
  updateLeadInput,
  validateAddressInput,
} from "./definitions.js";

const mapping = new GoogleMapsProvider();

// KNOWN GAP: this only detects weekends, not Victorian public holidays --
// there's no AU/VIC public-holiday calendar wired in yet. Since
// weekendHolidaySurchargePercent is still null (pending Blue Line), this
// doesn't block anything today, but it means the "holiday" half of that
// future surcharge won't apply correctly until a real calendar source is
// added. Flagged, not silently assumed handled.
function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00`).getUTCDay();
  return day === 0 || day === 6;
}

export async function executeToolCall(toolName: string, rawInput: unknown, conversationId: string): Promise<unknown> {
  switch (toolName) {
    case "validate_address": {
      const input = validateAddressInput.parse(rawInput);
      return await mapping.validateAddress(input.rawAddress);
    }

    case "geocode_address": {
      const input = geocodeAddressInput.parse(rawInput);
      return await mapping.geocodeAddress(input.placeId);
    }

    case "calculate_route": {
      const input = calculateRouteInput.parse(rawInput);
      return await mapping.calculateRoute(
        { lat: input.originLat, lng: input.originLng },
        { lat: input.destinationLat, lng: input.destinationLng },
      );
    }

    case "calculate_move_estimate": {
      const input = calculateMoveEstimateInput.parse(rawInput);
      const [inventoryRules, complexityConfig] = await Promise.all([getInventoryRules(), getActivePricingConfig()]);
      const output = calculateMoveComplexity(input, inventoryRules, complexityConfig.moveComplexity);
      const escalate = requiresHumanFollowup(
        output,
        complexityConfig.moveComplexity,
        input.inventory.some((i) => i.itemCategory === "piano"),
      );
      return { ...output, humanFollowupRecommended: escalate };
    }

    case "calculate_price": {
      const input = calculatePriceInput.parse(rawInput);
      const config = await getActivePricingConfig();

      const truckLocation = await getTruckStartingLocation(input.movingDate, config.pricing.callOut.depotAddress);
      const callOutRoute = await mapping.calculateRoute(truckLocation.address, input.pickupAddressFormatted);

      const result = calculatePrice(
        {
          truckTierId: input.truckTierId,
          crewSize: input.crewSize,
          durationMinutes: input.durationMinutes,
          movingDate: input.movingDate,
          isWeekendOrPublicHoliday: isWeekend(input.movingDate),
          stairsFlights: input.stairsFlights,
          heavyItemCount: input.heavyItemCount,
          pianoMoving: input.pianoMoving,
          longCarry: input.longCarry,
          packingRequired: input.packingRequired,
          callOutTravelMinutes: callOutRoute.durationMinutes,
        },
        config.pricing,
      );

      return { ...result };
    }

    case "create_lead": {
      const input = createLeadInput.parse(rawInput);
      const db = getDb();
      const [lead] = await db
        .insert(leads)
        .values({
          source: "chatbot",
          conversationId,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email,
          pickupAddressFormatted: input.pickupAddressFormatted,
          destinationAddressFormatted: input.destinationAddressFormatted,
          movingDate: input.movingDate,
          movingTime: input.movingTime,
          propertyType: input.propertyType,
          bedrooms: input.bedrooms,
          specialItems: input.specialItems,
          humanFollowupRequired: Boolean(input.specialItems),
        })
        .returning({ id: leads.id, status: leads.status });
      return { leadId: lead.id, status: lead.status };
    }

    case "update_lead": {
      const input = updateLeadInput.parse(rawInput);
      const db = getDb();
      const [lead] = await db
        .update(leads)
        .set({ ...input.fields, updatedAt: new Date() })
        .where(eq(leads.id, input.leadId))
        .returning({ id: leads.id, status: leads.status });
      return { leadId: lead.id, status: lead.status };
    }

    case "create_quote": {
      // Explicitly distinct from create_lead -- marks the transition from
      // ESTIMATE to QUOTATION per architecture doc Section 11. Not fully
      // built: the real quotation flow (what changes for the customer,
      // whether a human reviews before it fires) is Phase 3 scope.
      const db = getDb();
      const parsed = (rawInput as { leadId: string }).leadId;
      const [lead] = await db
        .update(leads)
        .set({ status: "quotation", updatedAt: new Date() })
        .where(eq(leads.id, parsed))
        .returning({ id: leads.id, status: leads.status });
      return { quoteId: lead.id, status: lead.status };
    }

    case "request_human_followup": {
      const input = requestHumanFollowupInput.parse(rawInput);
      const db = getDb();
      if (input.leadId) {
        await db.update(leads).set({ humanFollowupRequired: true, notes: input.reason }).where(eq(leads.id, input.leadId));
      }
      // WhatsApp alert to the team is Phase 3 scope (needs the WhatsApp
      // Business Platform/Cloud API tier confirmed -- see the roadmap) --
      // not wired in here yet. The database flag above is enough for the
      // internal dashboard to surface this once it exists.
      return { acknowledged: true };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
