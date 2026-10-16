// Tap-to-reply buttons in the chat (Ayesha, 2026-10-16). The assistant ends a message with
//   [[choices: Home | Apartment | Office]]
// and the chat window shows those as buttons under that message (only while it's the latest
// one); tapping one sends it as the customer's reply. The marker itself is never shown.
// Shared by the chat widget and the dashboard's transcript view.

const MARKER = /\s*\[\[choices:\s*([^\]]*)\]\]\s*$/i;

export function splitChoices(content: string): { text: string; choices: string[] } {
  const match = content.match(MARKER);
  if (!match) return { text: content, choices: [] };
  const choices = match[1]!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length <= 60)
    .slice(0, 10);
  return { text: content.slice(0, match.index).trimEnd(), choices };
}
