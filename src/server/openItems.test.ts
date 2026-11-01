import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openItems } from "./openItems.js";
import { blrRateCard } from "./quote/rateCard.js";

function nullPaths(value: unknown, prefix = ""): string[] {
  if (value === null) return [prefix];
  if (typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => nullPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("open items -- nothing missing gets skipped", () => {
  it("every empty (null) value in Blue Line's rate card is tracked by an open item", () => {
    const tracked = new Set(openItems.flatMap((i) => i.rateCardPaths ?? []));
    const untracked = nullPaths(blrRateCard).filter((p) => !tracked.has(p));
    expect(untracked).toEqual([]);
  });

  it("no open item points at a rate-card value that has since been filled in (delete or update it)", () => {
    const empty = new Set(nullPaths(blrRateCard));
    const stale = openItems.flatMap((i) => (i.rateCardPaths ?? []).filter((p) => !empty.has(p)).map((p) => `${i.id}: ${p}`));
    expect(stale).toEqual([]);
  });

  it("item ids are unique", () => {
    const ids = openItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("docs/chatbot-open-items.md lists every open item", () => {
    const doc = readFileSync(new URL("../../docs/chatbot-open-items.md", import.meta.url), "utf8");
    const missing = openItems.filter((i) => !doc.includes(`\`${i.id}\``)).map((i) => i.id);
    expect(missing).toEqual([]);
  });
});
