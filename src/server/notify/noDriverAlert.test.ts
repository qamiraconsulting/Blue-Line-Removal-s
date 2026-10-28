import { describe, expect, it } from "vitest";
import { driverOverdue } from "../../lib/drivers.js";
import type { OutgoingEmail } from "../quote/service.js";
import { sendNoDriverAlerts, type DriverlessJob, type NoDriverStore } from "./noDriverAlert.js";

// Blue Line, 28 Oct: a job with no driver 2 days before the move is flagged and the team emailed.

const job = (over: Partial<DriverlessJob> = {}): DriverlessJob => ({
  id: "b-1",
  date: "2026-11-02",
  arrivalTime: "08:00",
  truckLabel: "Baby Blue",
  truckType: "6-8T",
  customerName: "Jane Smith",
  fromText: "Preston",
  toText: "Brunswick",
  quoteReference: "BLR-20261028-ABC123",
  ...over,
});

function setup(jobs: DriverlessJob[], opts: { fail?: boolean } = {}) {
  const sent: OutgoingEmail[] = [];
  const marked: string[] = [];
  let asked: [string, string] | null = null;
  const store: NoDriverStore = {
    findDue: async (from, to) => {
      asked = [from, to];
      return jobs.filter((j) => !marked.includes(j.id));
    },
    markSent: async (ids) => void marked.push(...ids),
  };
  const deps = { store, sendEmail: async (e: OutgoingEmail) => (opts.fail ? false : (sent.push(e), true)), to: "team@example.com", dashboardUrl: "https://example.com/admin/trips" };
  return { deps, sent, marked, asked: () => asked };
}

describe("no-driver alert", () => {
  it("looks at today to 2 days ahead, emails the team once listing each job, and marks them", async () => {
    const { deps, sent, marked, asked } = setup([job(), job({ id: "b-2", arrivalTime: "13:00", customerName: null, quoteReference: null })]);
    expect(await sendNoDriverAlerts(deps, "2026-10-31", new Date())).toBe(2);
    expect(asked()).toEqual(["2026-10-31", "2026-11-02"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "team@example.com", kind: "team" });
    expect(sent[0]!.subject).toBe("Driver needed: 2 jobs in the next 2 days have no driver");
    expect(sent[0]!.text).toContain("8:00am -- Baby Blue -- Jane Smith (Preston to Brunswick) -- BLR-20261028-ABC123");
    expect(sent[0]!.text).toContain("https://example.com/admin/trips");
    expect(marked).toEqual(["b-1", "b-2"]);
    // nothing new: no second email
    expect(await sendNoDriverAlerts(deps, "2026-10-31", new Date())).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("an email that fails isn't marked, so the next run tries again", async () => {
    const { deps, marked } = setup([job()], { fail: true });
    expect(await sendNoDriverAlerts(deps, "2026-10-31", new Date())).toBe(0);
    expect(marked).toEqual([]);
  });

  it("the dashboard shows a job in red from 2 days before the move", () => {
    expect(driverOverdue("2026-11-02", "2026-10-31")).toBe(true);
    expect(driverOverdue("2026-11-03", "2026-10-31")).toBe(false);
    expect(driverOverdue("2026-10-31", "2026-10-31")).toBe(true);
  });
});
