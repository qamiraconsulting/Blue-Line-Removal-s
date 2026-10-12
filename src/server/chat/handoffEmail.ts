import { site } from "../../data/site.js";
import type { EmailContent } from "../quote/emails.js";

// Internal alert when the chat hands a customer to a person (WhatsApp alerts wait on the
// open item "whatsapp-alerts"). Plain text only -- it goes to the team, never a customer.
export function renderHandoffEmail(input: {
  conversationId: string;
  reason: string;
  name?: string;
  phone?: string;
  email?: string;
  from?: string;
  to?: string;
  callbackRequested?: boolean;
  callbackTime?: string;
}): EmailContent {
  const text = [
    input.callbackRequested ? `CALL BACK REQUESTED -- ${input.callbackTime || "no time given"}` : "A customer in the website chat needs a person.",
    "",
    `Reason: ${input.reason}`,
    `Name: ${input.name || "-"}`,
    `Phone: ${input.phone || "-"}`,
    `Email: ${input.email || "-"}`,
    `Moving: ${input.from || "?"} -> ${input.to || "?"}`,
    "",
    `Read the chat and reply: ${site.url}/admin/conversations/${input.conversationId}`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    subject: `${input.callbackRequested ? "Call back requested" : "Chat needs a person"}: ${input.reason}${input.name ? ` (${input.name})` : ""}`,
    text,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}
