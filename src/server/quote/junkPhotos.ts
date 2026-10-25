import { attachmentName, base64Bytes, MAX_JUNK_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES, PHOTO_TYPES, samePhotoFamily, sniffPhotoType, type PhotoType } from "../../lib/junkPhotos.js";

// The server's own check of the junk photos sent with a Junk Removal quote request -- the
// browser shrinks them, but nothing it says is trusted. They go on as email attachments to the
// team (src/server/quote/service.ts); they are not stored in the database.

export interface EmailAttachment {
  filename: string;
  /** base64 */
  content: string;
  contentType: string;
}

export interface RawPhoto {
  name: string;
  type: string;
  data: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
export const PHOTO_PROBLEM = "One of your photos couldn't be read. Please remove it and add it again, or send us fewer photos.";

export function checkJunkPhotos(photos: readonly RawPhoto[] | undefined): { ok: true; attachments: EmailAttachment[] } | { ok: false; error: string } {
  if (!photos || photos.length === 0) return { ok: true, attachments: [] };
  if (photos.length > MAX_JUNK_PHOTOS) return { ok: false, error: `Please send up to ${MAX_JUNK_PHOTOS} photos.` };

  let total = 0;
  const attachments: EmailAttachment[] = [];
  for (const [i, photo] of photos.entries()) {
    if (!(PHOTO_TYPES as readonly string[]).includes(photo.type) || !BASE64.test(photo.data)) return { ok: false, error: PHOTO_PROBLEM };
    const size = base64Bytes(photo.data);
    if (size === 0 || size > MAX_PHOTO_BYTES) return { ok: false, error: PHOTO_PROBLEM };
    total += size;
    // What the bytes really are must match what the browser said (no renamed PDFs or videos).
    const real = sniffPhotoType(Buffer.from(photo.data.slice(0, 24), "base64"));
    if (!real || !samePhotoFamily(real, photo.type as PhotoType)) return { ok: false, error: PHOTO_PROBLEM };
    attachments.push({ filename: attachmentName(photo.name, i, real), content: photo.data, contentType: real });
  }
  if (total > MAX_TOTAL_PHOTO_BYTES) return { ok: false, error: "Those photos are a little too large to send together. Please remove one or two and try again." };
  return { ok: true, attachments };
}
