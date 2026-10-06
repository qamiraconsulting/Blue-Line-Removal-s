import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// DATABASE_URL is a Vercel env var (Neon's Vercel integration wires this
// automatically on deploy) -- same secrets-in-env-vars pattern as
// RESEND_API_KEY in api/quote.ts. Not set locally until Ayesha's Neon
// project exists; every caller of `db` should expect this to throw until then.
const connectionString = process.env.DATABASE_URL;

function createClient() {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. This is expected until the Neon project is provisioned -- " +
        "see the roadmap's Phase 0/1 checklist.",
    );
  }
  // max: 1 -- Vercel functions are short-lived and stateless, so each
  // invocation gets its own connection rather than pooling across requests.
  // Prod scale, if a bigger pool is ever warranted, uses Neon's own pooled
  // connection string (the -pooler host) rather than raising this.
  const client = postgres(connectionString, { max: 1 });
  return drizzle(client, { schema });
}

let cached: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!cached) cached = createClient();
  return cached;
}
