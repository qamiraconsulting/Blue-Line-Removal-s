import { describe, expect, it } from "vitest";
import { attachmentName, base64Bytes, fitWithin, photoTypeOf, samePhotoFamily, sniffPhotoType } from "./junkPhotos.js";

const bytes = (...n: number[]) => new Uint8Array(n);
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);

describe("junk photos", () => {
  it("knows jpg, png and heic from the type or the file name (phones often leave HEIC's type blank)", () => {
    expect(photoTypeOf({ name: "a.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(photoTypeOf({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(photoTypeOf({ name: "x.png", type: "" })).toBe("image/png");
    expect(photoTypeOf({ name: "x.jpeg", type: "application/octet-stream" })).toBe("image/jpeg");
    expect(photoTypeOf({ name: "x.gif", type: "image/gif" })).toBeNull();
    expect(photoTypeOf({ name: "notes.pdf", type: "application/pdf" })).toBeNull();
  });

  it("shrinks to fit a box without ever enlarging", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("recognises what the bytes really are", () => {
    expect(sniffPhotoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffPhotoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffPhotoType(ftyp("heic"))).toBe("image/heic");
    expect(sniffPhotoType(ftyp("mif1"))).toBe("image/heif");
    expect(sniffPhotoType(ftyp("isom"))).toBeNull(); // a video, not a photo
    expect(sniffPhotoType(new TextEncoder().encode("%PDF-1.7 not a photo"))).toBeNull();
    expect(sniffPhotoType(bytes())).toBeNull();
    expect(samePhotoFamily("image/heic", "image/heif")).toBe(true);
    expect(samePhotoFamily("image/jpeg", "image/png")).toBe(false);
  });

  it("gives attachments tidy names, whatever the phone called them", () => {
    expect(attachmentName("IMG 0042.HEIC", 0, "image/heic")).toBe("junk-photo-1-IMG-0042.heic");
    // a path-like name never survives: nothing but letters, numbers, spaces, dashes and underscores
    const odd = attachmentName("../../etc/passwd", 1, "image/jpeg");
    expect(odd).toMatch(/^junk-photo-2[A-Za-z0-9_-]*\.jpg$/);
    expect(odd.includes("/") || odd.includes("\\") || odd.includes("..")).toBe(false);
    expect(attachmentName("", 2, "image/png")).toBe("junk-photo-3.png");
  });

  it("counts what base64 decodes to", () => {
    expect(base64Bytes(btoa("hello world"))).toBe(11);
    expect(base64Bytes(btoa("ab"))).toBe(2);
    expect(base64Bytes(btoa("abc"))).toBe(3);
  });
});
