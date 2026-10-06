import { describe, expect, it, vi } from "vitest";
import { fetchDrivingLeg, normalisePlace, resolveLeg, routeKey, toGoogleAddress, type DistanceCache } from "./distance.js";

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const routesBody = { routes: [{ distanceMeters: 12345, duration: "1234s" }] };

function memoryCache(): DistanceCache & { store: Map<string, { meters: number; seconds: number }> } {
  const store = new Map<string, { meters: number; seconds: number }>();
  return {
    store,
    get: async (o, d) => store.get(`${o}|${d}`) ?? null,
    put: async (o, d, v) => void store.set(`${o}|${d}`, v),
  };
}

describe("normalisePlace / routeKey", () => {
  it("collapses the different ways of writing the same suburb", () => {
    const keys = ["Preston VIC", "preston, Victoria", " Preston ,  VIC, Australia "].map(normalisePlace);
    expect(keys[0]).toBe("preston vic");
    expect(keys[1]).toBe("preston vic");
    expect(keys[2]).toBe("preston vic");
  });

  it("builds a stable key per direction", () => {
    expect(routeKey("Preston", "Brunswick")).toEqual({ originKey: "preston", destKey: "brunswick" });
  });
});

describe("toGoogleAddress", () => {
  it("biases bare suburbs to Victoria", () => {
    expect(toGoogleAddress("Preston")).toBe("Preston, VIC, Australia");
  });
  it("leaves an explicit state alone", () => {
    expect(toGoogleAddress("Parramatta NSW")).toBe("Parramatta NSW, Australia");
  });
});

describe("fetchDrivingLeg", () => {
  it("asks Google for a traffic-unaware driving route and reads metres + seconds", async () => {
    const fetchImpl = vi.fn(async () => okResponse(routesBody)) as unknown as typeof fetch;
    const leg = await fetchDrivingLeg("Preston", "Brunswick", { apiKey: "k", fetchImpl });
    expect(leg).toEqual({ meters: 12345, seconds: 1234 });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("k");
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("routes.distanceMeters,routes.duration");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      origin: { address: "Preston, VIC, Australia" },
      destination: { address: "Brunswick, VIC, Australia" },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    });
  });

  it("returns null on an HTTP error, a malformed body, or a thrown error", async () => {
    const bad = (impl: () => Promise<unknown>) => ({ apiKey: "k", fetchImpl: vi.fn(impl) as unknown as typeof fetch });
    expect(await fetchDrivingLeg("a", "b", bad(async () => ({ ok: false })))).toBeNull();
    expect(await fetchDrivingLeg("a", "b", bad(async () => okResponse({ routes: [] })))).toBeNull();
    expect(await fetchDrivingLeg("a", "b", bad(async () => okResponse({ routes: [{ distanceMeters: 5 }] })))).toBeNull();
    expect(await fetchDrivingLeg("a", "b", bad(async () => { throw new Error("network"); }))).toBeNull();
  });
});

describe("resolveLeg", () => {
  it("converts to km (1dp) and whole minutes, rounding time UP", async () => {
    const fetchImpl = vi.fn(async () => okResponse(routesBody)) as unknown as typeof fetch;
    expect(await resolveLeg("Preston", "Brunswick", { routes: { apiKey: "k", fetchImpl } })).toEqual({ km: 12.3, minutes: 21 });
  });

  it("fills the cache, then answers repeat lookups (even reworded) without calling Google", async () => {
    const fetchImpl = vi.fn(async () => okResponse(routesBody)) as unknown as typeof fetch;
    const cache = memoryCache();
    const deps = { routes: { apiKey: "k", fetchImpl }, cache };

    await resolveLeg("Preston VIC", "Brunswick", deps);
    await resolveLeg("preston, Victoria", " Brunswick ", deps);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it("works from the cache alone when there's no Google key", async () => {
    const cache = memoryCache();
    cache.store.set("preston|brunswick", { meters: 10000, seconds: 900 });
    expect(await resolveLeg("Preston", "Brunswick", { routes: null, cache })).toEqual({ km: 10, minutes: 15 });
  });

  it("returns null with no key and nothing cached, or with a blank place", async () => {
    expect(await resolveLeg("Preston", "Brunswick", { routes: null })).toBeNull();
    expect(await resolveLeg("", "Brunswick", { routes: { apiKey: "k" } })).toBeNull();
  });

  it("a broken cache never breaks a lookup", async () => {
    const fetchImpl = vi.fn(async () => okResponse(routesBody)) as unknown as typeof fetch;
    const broken: DistanceCache = {
      get: async () => { throw new Error("db down"); },
      put: async () => { throw new Error("db down"); },
    };
    expect(await resolveLeg("Preston", "Brunswick", { routes: { apiKey: "k", fetchImpl }, cache: broken })).toEqual({ km: 12.3, minutes: 21 });
  });
});
