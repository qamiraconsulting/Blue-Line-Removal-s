import { customerRecipient, type OutgoingEmail } from "../quote/service.js";
import { renderPlainQuoteEmail, type PdfQuoteJob, type PdfSender } from "./pdfQuote.js";

// Sends a customer their quote -- the branded PDF from the Apps Script when it's set up, else
// the same figures as a plain email. Test figures only ever go to the preview's test inbox.

export interface SendQuoteDeps {
  pdf?: PdfSender;
  sendEmail: (email: OutgoingEmail) => Promise<boolean>;
  customerReplyTo: string;
  testEmailTo?: string | null;
}

export async function sendCustomerQuote(job: PdfQuoteJob, deps: SendQuoteDeps): Promise<{ emailed: boolean; via: "pdf" | "email" | null }> {
  const to = customerRecipient(job.to, job.testMode, deps.testEmailTo);
  if (!to) return { emailed: false, via: null };
  const addressed = { ...job, to };

  if (deps.pdf && (await deps.pdf(addressed).catch(() => false))) return { emailed: true, via: "pdf" };

  const sent = await deps
    .sendEmail({ ...renderPlainQuoteEmail(addressed), to, replyTo: deps.customerReplyTo, kind: "customer" })
    .catch(() => false);
  return { emailed: sent, via: sent ? "email" : null };
}
