import { defineConfig } from "drizzle-kit";

// Migrations aren't runnable until DATABASE_URL exists (Neon project
// provisioning is Ayesha's Phase 0/1 task) -- this config is ready to go
// the moment it does: `npx drizzle-kit generate` then `npx drizzle-kit migrate`.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
