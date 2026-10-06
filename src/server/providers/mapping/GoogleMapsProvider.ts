import { AddressType, Client, GeocodingAddressComponentType, TravelMode } from "@googlemaps/google-maps-services-js";
import type { GeocodeResult, MappingProvider, RouteResult, ValidateAddressResult } from "./MappingProvider.js";

// Server-side only. GOOGLE_MAPS_SERVER_KEY is a separate, unrestricted-by-
// referrer key from the client-side Places Autocomplete widget key -- see
// the architecture doc's Section 4/13 note: two keys, two restriction
// types, never conflated. This one is billable and business-logic-
// relevant and must never reach the browser.
export class GoogleMapsProvider implements MappingProvider {
  private client = new Client({});

  private get apiKey(): string {
    const key = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_MAPS_SERVER_KEY is not set -- expected until Phase 0's Google Cloud project is provisioned.",
      );
    }
    return key;
  }

  async validateAddress(rawAddress: string): Promise<ValidateAddressResult> {
    const response = await this.client.placeAutocomplete({
      params: {
        input: rawAddress,
        key: this.apiKey,
        components: ["country:au"],
      },
    });
    const suggestions = response.data.predictions.map((p) => ({
      placeId: p.place_id,
      description: p.description,
    }));
    return { isValid: suggestions.length > 0, suggestions };
  }

  async geocodeAddress(placeId: string): Promise<GeocodeResult> {
    const response = await this.client.placeDetails({
      params: { place_id: placeId, key: this.apiKey },
    });
    const result = response.data.result;
    const components = result.address_components ?? [];
    const find = (type: AddressType | GeocodingAddressComponentType) =>
      components.find((c) => c.types.includes(type))?.long_name ?? "";

    return {
      formattedAddress: result.formatted_address ?? "",
      latitude: result.geometry?.location.lat ?? 0,
      longitude: result.geometry?.location.lng ?? 0,
      street: [find(AddressType.street_number), find(AddressType.route)].filter(Boolean).join(" "),
      suburb: find(AddressType.locality) || find(AddressType.sublocality),
      state: find(AddressType.administrative_area_level_1),
      postcode: find(AddressType.postal_code),
      country: find(AddressType.country),
    };
  }

  async calculateRoute(
    origin: { lat: number; lng: number } | string,
    destination: { lat: number; lng: number } | string,
  ): Promise<RouteResult> {
    try {
      const response = await this.client.directions({
        params: {
          origin: typeof origin === "string" ? origin : `${origin.lat},${origin.lng}`,
          destination: typeof destination === "string" ? destination : `${destination.lat},${destination.lng}`,
          mode: TravelMode.driving,
          key: this.apiKey,
        },
      });

      const route = response.data.routes[0];
      const leg = route?.legs[0];
      if (!leg) {
        return { distanceKm: 0, durationMinutes: 0, provider: "google_maps", routeStatus: "not_found" };
      }

      return {
        distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
        durationMinutes: Math.round(leg.duration.value / 60),
        provider: "google_maps",
        routeStatus: "ok",
      };
    } catch (err) {
      console.error("Google Maps route calculation failed:", err);
      return { distanceKm: 0, durationMinutes: 0, provider: "google_maps", routeStatus: "error" };
    }
  }
}
