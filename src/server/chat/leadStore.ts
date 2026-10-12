import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { leads } from "../db/schema.js";

export interface LeadPatch {
  customerName?: string;
  phone?: string;
  email?: string;
  fromText?: string;
  toText?: string;
  quoteReference?: string;
  /** Only ever set to true here -- a dashboard reply is what clears it. */
  humanFollowupRequired?: true;
  notes?: string;
}

/** One lead per chat conversation; later details fill in or overwrite earlier ones. */
export interface LeadStore {
  /** Returns whether the chat was ALREADY waiting for a person before this call. */
  upsertForConversation(conversationId: string, patch: LeadPatch): Promise<{ wasFlagged: boolean }>;
}

// Drop blanks so a later call without (say) the phone never wipes one already captured.
const defined = (patch: LeadPatch) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== "")) as LeadPatch;

export const dbLeadStore: LeadStore = {
  async upsertForConversation(conversationId, patch) {
    const db = getDb();
    const values = defined(patch);
    const [existing] = await db
      .select({ flagged: leads.humanFollowupRequired })
      .from(leads)
      .where(eq(leads.conversationId, conversationId))
      .limit(1);
    await db
      .insert(leads)
      .values({ ...values, conversationId, source: "chatbot" })
      .onConflictDoUpdate({ target: leads.conversationId, set: { ...values, updatedAt: new Date() } });
    return { wasFlagged: existing?.flagged ?? false };
  },
};
