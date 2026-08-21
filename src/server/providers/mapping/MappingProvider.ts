// Named interface, not a direct Google SDK import scattered through the
// codebase (architecture doc Section 4) -- GoogleMapsProvider is the MVP
// implementation; MapboxProvider/HereProvider are future cost/coverage
// levers behind the same shape.

export interface PlaceCandidate {
  placeId: string;
  description: string;
}

export interface ValidateAddressResult {
  isValid: boolean;
  suggestions: PlaceCandidate[];
}

export interface GeocodeResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  provider: string;
  routeStatus: "ok" | "not_found" | "error";
}

export interface MappingProvider {
  validateAddress(rawAddress: string): Promise<ValidateAddressResult>;
  geocodeAddress(placeId: string): Promise<GeocodeResult>;
  calculateRoute(origin: { lat: number; lng: number } | string, destination: { lat: number; lng: number } | string): Promise<RouteResult>;
}
