import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Resend is mocked: these tests check what would be emailed, nothing is sent.
const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { default: handler } = await import("../quote.js");

type Sent = { from: string; to: string[]; subject: string; text: string; attachments?: { filename: string; content: string; contentType: string }[] };

async function run(body: Record<string, unknown>, method = "POST") {
  let status = 200;
  let json: unknown;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      json = value;
      return res;
    },
  } as unknown as VercelResponse;
  await handler({ method, body } as VercelRequest, res);
  return { status, body: json as { ok?: boolean; error?: string } };
}

const sent = () => send.mock.lastCall?.[0] as Sent;

const jpeg = (n = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1)]).toString("base64");
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 2)]).toString("base64");
const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), Buffer.from("heic"), Buffer.alloc(300, 3)]).toString("base64");

const contact = { name: "Sam Lee", phone: "0400 000 000", email: "sam@example.com" };
const moving = { ...contact, need: "moving", from: "Richmond", to: "Geelong", date: "2026-11-20", propertySize: "3 Bedrooms" };
const junk = (extra: Record<string, unknown> = {}) => ({
  ...contact,
  need: "junk",
  from: "Brunswick",
  date: "2026-11-21",
  junkDetails: "old sofa, fridge, 10 garden bags",
  photos: [
    { name: "IMG_1.jpg", type: "image/jpeg", data: jpeg() },
    { name: "IMG_2.png", type: "image/png", data: png() },
    { name: "IMG_3.heic", type: "image/heic", data: heic() },
  ],
  ...extra,
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  process.env.RESEND_API_KEY = "re_test";
  process.env.LEAD_FROM_EMAIL = "leads@example.com";
});

describe("Moving quotes: the team email is unchanged", () => {
  it("sends the same lines as before, and ignores any junk details or photos", async () => {
    expect(await run({ ...moving, junkDetails: "old sofa", photos: [{ name: "a.jpg", type: "image/jpeg", data: jpeg() }] })).toEqual({ status: 200, body: { ok: true } });
    const email = sent();
    expect(email.subject).toBe("New quote request from Sam Lee (Moving)");
    expect(email.text).toBe(
      [
        "Name: Sam Lee",
        "Phone: 0400 000 000",
        "Email: sam@example.com",
        "Needs help with: Moving",
        "Moving from: Richmond",
        "Moving to: Geelong",
        "Preferred date: 2026-11-20",
        "Property size: 3 Bedrooms",
      ].join("\n"),
    );
    expect(email.attachments).toBeUndefined();
  });
});

describe("Junk Removal quotes: details and photos reach the team", () => {
  it("emails the junk details and the photos as attachments, with which service was picked", async () => {
    expect(await run(junk())).toEqual({ status: 200, body: { ok: true } });
    const email = sent();
    expect(email.subject).toBe("New quote request from Sam Lee (Junk Removal)");
    expect(email.text).toContain("Needs help with: Junk Removal");
    expect(email.text).toContain("Moving from: Brunswick");
    expect(email.text).toContain("Preferred date: 2026-11-21");
    expect(email.text).toContain("Junk details: old sofa, fridge, 10 garden bags");
    expect(email.text).toContain("Junk photos: 3 attached to this email");
    expect(email.text).not.toContain("Moving to:");
    expect(email.text).not.toContain("Property size:");
    expect(email.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ["junk-photo-1-IMG_1.jpg", "image/jpeg"],
      ["junk-photo-2-IMG_2.png", "image/png"],
      ["junk-photo-3-IMG_3.heic", "image/heic"],
    ]);
  });

  it("works with no photos and no details too", async () => {
    expect((await run(junk({ photos: [], junkDetails: "" }))).status).toBe(200);
    expect(sent().text).toContain("Junk details: -");
    expect(sent().text).toContain("Junk photos: none sent");
    expect(sent().attachments).toBeUndefined();
  });

  it("refuses photos that aren't what they claim, too many, or too big -- and sends nothing", async () => {
    const bad = (photos: unknown[]) => run(junk({ photos }));
    const notAPhoto = Buffer.from("%PDF-1.7 definitely not a photo").toString("base64");
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: notAPhoto }])).toMatchObject({ status: 400, body: { error: expect.stringContaining("couldn't be read") } });
    expect(await bad([{ name: "a.jpg", type: "image/png", data: jpeg() }])).toMatchObject({ status: 400 }); // a JPEG labelled PNG
    expect(await bad([{ name: "a.gif", type: "image/gif", data: jpeg() }])).toMatchObject({ status: 400 });
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: "not base64!!" }])).toMatchObject({ status: 400 });
    expect(await bad([{ name: "a.jpg", type: "image/jpeg", data: jpeg(950_000) }])).toMatchObject({ status: 400 }); // over 900 KB
    expect(await bad(Array.from({ length: 7 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", data: jpeg() })))).toMatchObject({ status: 400 });
    expect(await bad(Array.from({ length: 4 }, (_, i) => ({ name: `${i}.jpg`, type: "image/jpeg", data: jpeg(800_000) })))).toMatchObject({
      status: 400,
      body: { error: expect.stringContaining("too large to send together") },
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("existing checks still apply", () => {
  it("needs name, phone and a valid email, and only takes POST", async () => {
    expect(await run({ ...moving, name: "" })).toMatchObject({ status: 400 });
    expect(await run({ ...moving, email: "not-an-email" })).toMatchObject({ status: 400 });
    expect(await run(moving, "GET")).toMatchObject({ status: 405 });
    expect(send).not.toHaveBeenCalled();
  });

  it("says so when Resend fails", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(junk())).toMatchObject({ status: 502 });
  });
});
