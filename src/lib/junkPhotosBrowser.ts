import { attachmentName, fitWithin, MAX_PHOTO_BYTES, PHOTO_TARGET_BYTES, photoTypeOf, type JunkPhotoPayload } from "./junkPhotos";

// The browser half of the junk photos: shrinks what the customer picks so it can be sent (the server
// side never imports this -- it needs the DOM). Shared limits and checks: ./junkPhotos.ts

export interface PreparedPhoto extends JunkPhotoPayload {
  id: string;
  bytes: number;
  /** A small picture to show; null when the browser can't draw this kind of photo (e.g. HEIC outside Safari). */
  previewUrl: string | null;
}

export type PrepareResult = { ok: true; photo: PreparedPhoto } | { ok: false; error: string };

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function decode(file: File): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    // imageOrientation: phones store the rotation beside the picture, so apply it.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h), width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode"));
    el.src = url;
  });
  return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function shrink(file: File): Promise<Blob | null> {
  const image = await decode(file);
  try {
    // Try a few sizes and qualities until it is small enough to send.
    for (const [max, quality] of [[1600, 0.8], [1280, 0.75], [1024, 0.7], [800, 0.65]] as const) {
      const { width, height } = fitWithin(image.width, image.height, max);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff"; // PNGs with see-through areas
      ctx.fillRect(0, 0, width, height);
      image.draw(ctx, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_TARGET_BYTES) return blob;
      if (blob && max === 800) return blob.size <= MAX_PHOTO_BYTES ? blob : null;
    }
    return null;
  } finally {
    image.close();
  }
}

/** Turns a chosen file into something small enough to send, or says why not. */
export async function prepareJunkPhoto(file: File, index: number): Promise<PrepareResult> {
  const type = photoTypeOf(file);
  if (!type) return { ok: false, error: `${file.name || "That file"} isn't a photo we can use. Please choose a JPG, PNG or HEIC.` };
  const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const small = await shrink(file);
    if (small) {
      return {
        ok: true,
        photo: { id, name: attachmentName(file.name, index, "image/jpeg"), type: "image/jpeg", data: await blobToBase64(small), bytes: small.size, previewUrl: URL.createObjectURL(small) },
      };
    }
  } catch {
    // The browser couldn't read it (HEIC in Chrome, say): send it as it is if it is already small.
  }
  if (file.size <= MAX_PHOTO_BYTES) {
    return { ok: true, photo: { id, name: attachmentName(file.name, index, type), type, data: await blobToBase64(file), bytes: file.size, previewUrl: null } };
  }
  return { ok: false, error: `${file.name || "That photo"} is too large for this browser to shrink. Please try a JPG or PNG.` };
}
