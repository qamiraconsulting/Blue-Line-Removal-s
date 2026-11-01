// Tap-to-reply buttons in the chat (Ayesha, 2026-10-16). The assistant ends a message with
//   [[choices: Home | Apartment | Office]]
// and the chat window shows those as buttons under that message (only while it's the latest
// one); tapping one sends it as the customer's reply. The marker itself is never shown.
// Shared by the chat widget and the dashboard's transcript view.

const MARKER = /\s*\[\[choices:\s*([^\]]*)\]\]\s*$/i;
// The assistant sometimes adds a sentence after the buttons line ("You can also name another
// time", 28 Oct test): a marker on a line of its own still counts, and that sentence is kept.
const OWN_LINE_MARKER = /^[ \t]*\[\[choices:\s*([^\]\n]*)\]\][ \t]*$/gim;

const parseChoices = (list: string) =>
  list
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length <= 60)
    .slice(0, 10);

export function splitChoices(content: string): { text: string; choices: string[] } {
  const match = content.match(MARKER);
  if (match) return { text: content.slice(0, match.index).trimEnd(), choices: parseChoices(match[1]!) };
  const own = [...content.matchAll(OWN_LINE_MARKER)].pop();
  if (!own) return { text: content, choices: [] };
  const before = content.slice(0, own.index).trim();
  const after = content.slice(own.index! + own[0].length).trim();
  return { text: [before, after].filter(Boolean).join("\n\n"), choices: parseChoices(own[1]!) };
}
