import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env itself; Node can. A missing file is fine -- `generate`
// never touches the database, only `migrate` needs a connection string.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env yet
}

// Migrations use the direct (unpooled) Neon connection. The pooled DATABASE_URL is for
// the app at runtime. Both must point at the dedicated blr_chatbot database -- never the
// project's default database, which holds the older ElevenLabs-era tables.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
