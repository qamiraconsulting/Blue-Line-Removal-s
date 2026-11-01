// Junk-removal photos on the Quick Quote form (Ayesha, 2026-10-25). The customer picks a few
// photos (JPG, PNG or HEIC; the phone camera works), the browser shrinks them, and they travel
// inside the normal form submission as base64, to arrive as attachments on the team's quote email.
//
// Vercel rejects request bodies over 4.5 MB, and base64 adds a third, so the limits below keep a
// full submission well under that. The browser shrinks photos to fit; the server checks them
// again (src/server/quote/junkPhotos.ts) and never trusts the browser.

export const MAX_JUNK_PHOTOS = 6;
/** The browser aims for this size per photo (about 1280 px wide JPEG). */
export const PHOTO_TARGET_BYTES = 420_000;
/** The server refuses a photo bigger than this after the browser has shrunk it. */
export const MAX_PHOTO_BYTES = 900_000;
/** All photos together (before base64): under Vercel's 4.5 MB request limit once encoded. */
export const MAX_TOTAL_PHOTO_BYTES = 2_800_000;
export const MAX_JUNK_DETAILS = 1000;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/** What the file picker offers: phones show the camera and the photo library. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif";

export interface JunkPhotoPayload {
  name: string;
  type: PhotoType;
  /** The photo, base64 (no "data:" prefix). */
  data: string;
}

const EXTENSION_TYPE: Record<string, PhotoType> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif" };

/** The photo type from the file's own type, or failing that its extension (phones often leave HEIC's type blank). */
export function photoTypeOf(file: { name: string; type: string }): PhotoType | null {
  const mime = file.type.toLowerCase();
  if ((PHOTO_TYPES as readonly string[]).includes(mime)) return mime as PhotoType;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPE[ext] ?? null;
}

/** Fits width x height inside a max x max box, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** What the bytes really are, from the first few (so a renamed file is caught). */
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) === "ftyp") {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heim", "heis"].includes(brand)) return "image/heif";
  }
  return null;
}

/** The two kinds are the same family: a .heic named file may be sniffed as heif and vice versa. */
export const samePhotoFamily = (a: PhotoType, b: PhotoType) => a === b || (a.startsWith("image/he") && b.startsWith("image/he"));

/** A tidy, safe file name for the attachment. */
export function attachmentName(name: string, index: number, type: PhotoType): string {
  const ext = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/heic" ? "heic" : "heif";
  const base = name
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .trim()
    .slice(0, 40);
  return `junk-photo-${index + 1}${base ? `-${base.replace(/\s+/g, "-")}` : ""}.${ext}`;
}

/** Bytes a base64 string decodes to. */
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
