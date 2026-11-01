// Blue, the chat's mascot (Ayesha, 2026-11-01): a blue robot kangaroo with a headset. Since
// 2026-11-02 it's Ayesha's own round image (D:\BLR Theme\Mascot\blue-round-v3.webp: orange ring,
// white background, ears to shoulders), shown exactly as supplied -- only the empty margin
// outside the ring was trimmed so the ring sits centred and whole in the circle. Nothing is drawn
// around it in code. The chat launcher, the chat header and the greeting bubble all use this file.
export const BLUE_FACE = "/images/blue-avatar-round.webp";

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
