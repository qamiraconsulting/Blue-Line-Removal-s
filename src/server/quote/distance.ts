import type { LegDistance } from "./calculateQuote.js";

// Driving distance/time between two places via Google's Routes API.
//
// - "Traffic-unaware": the same pair always gives the same answer, which is what makes a
//   fixed price reproducible (and it's the cheaper tier).
// - Cached per normalised place pair, because suburb pairs repeat constantly and Google
//   bills per lookup.
// - Any failure resolves to `null`; the caller turns that into a manual-review outcome.
//   A price is never guessed.

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const OTHER_STATE = /\b(vic|victoria|nsw|new south wales|qld|queensland|sa|south australia|wa|western australia|tas|tasmania|nt|northern territory|act)\b/i;

/** "Preston VIC", "preston, Victoria" and " Preston " all collapse to the same key. */
export function normalisePlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/\baustralia\b/g, "")
    .replace(/\bvictoria\b/g, "vic")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function routeKey(origin: string, destination: string): { originKey: string; destKey: string } {
  return { originKey: normalisePlace(origin), destKey: normalisePlace(destination) };
}

/** Bias bare suburb names to Victoria so "Preston" doesn't resolve somewhere else. */
export function toGoogleAddress(text: string): string {
  const trimmed = text.trim();
  return OTHER_STATE.test(trimmed) ? `${trimmed}, Australia` : `${trimmed}, VIC, Australia`;
}

export interface RoutesClientConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchDrivingLeg(
  origin: string,
  destination: string,
  config: RoutesClientConfig,
): Promise<{ meters: number; seconds: number } | null> {
  const doFetch = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);
  try {
    const res = await doFetch(ROUTES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: toGoogleAddress(origin) },
        destination: { address: toGoogleAddress(destination) },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        regionCode: "AU",
        languageCode: "en-AU",
        units: "METRIC",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: { distanceMeters?: number; duration?: string }[] };
    const route = data.routes?.[0];
    const seconds = route?.duration ? Number.parseInt(route.duration, 10) : NaN; // "1234s"
    if (!route || typeof route.distanceMeters !== "number" || Number.isNaN(seconds)) return null;
    return { meters: route.distanceMeters, seconds };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface DistanceCache {
  get(originKey: string, destKey: string): Promise<{ meters: number; seconds: number } | null>;
  put(originKey: string, destKey: string, value: { meters: number; seconds: number }): Promise<void>;
}

export interface ResolveLegDeps {
  routes: RoutesClientConfig | null;
  cache?: DistanceCache;
}

/** Cache first, then Google. Returns km (1dp) and whole minutes, or null if it can't be resolved. */
export async function resolveLeg(origin: string, destination: string, deps: ResolveLegDeps): Promise<LegDistance | null> {
  if (!origin.trim() || !destination.trim()) return null;
  const { originKey, destKey } = routeKey(origin, destination);
  if (!originKey || !destKey) return null;

  let value: { meters: number; seconds: number } | null = null;
  try {
    value = (await deps.cache?.get(originKey, destKey)) ?? null;
  } catch {
    value = null; // a cache failure must never break a quote
  }

  if (!value && deps.routes) {
    value = await fetchDrivingLeg(origin, destination, deps.routes);
    if (value) {
      try {
        await deps.cache?.put(originKey, destKey, value);
      } catch {
        // ignore -- cache is best-effort
      }
    }
  }

  if (!value) return null;
  return { km: Math.round(value.meters / 100) / 10, minutes: Math.ceil(value.seconds / 60) };
}
