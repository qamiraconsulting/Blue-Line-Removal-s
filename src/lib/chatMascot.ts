// Blue, the chat's mascot (Ayesha, 2026-11-01): a blue robot kangaroo with a headset. The face is
// cropped from D:\BLR Theme\Mascot\blue-clean.png (specks removed) -- the chat launcher, the chat
// header and the greeting bubble all use this one file.
export const BLUE_FACE = "/images/blue-face.webp";

// The greeting bubble is closed, or the chat was opened: it isn't shown again for the rest of
// the visit (this browser tab).
const GREETING_DONE_KEY = "blr_chat_greeting_done";

export function markGreetingDone() {
  try {
    sessionStorage.setItem(GREETING_DONE_KEY, "1");
  } catch {
    // storage blocked: the widget's own state still hides it for this page
  }
}

export function greetingDone() {
  try {
    return sessionStorage.getItem(GREETING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}
