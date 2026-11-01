// Blue, the chat's mascot (Ayesha, 2026-11-01): a blue robot kangaroo with a headset. Since
// 2026-11-02 the whole head -- both ears, antenna and headset -- is scaled to fit a circle with
// nothing cut off, from D:\BLR Theme\Mascot\blue-v2-clean.png (stray specks removed). The image is
// transparent outside the head; each place draws its own white circle behind it in CSS. The chat
// launcher, the chat header and the greeting bubble all use this one file.
export const BLUE_FACE = "/images/blue-avatar.webp";

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
