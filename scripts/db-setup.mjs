// Creates the chatbot's tables in the dedicated `blr_chatbot` Neon database -- safely.
//
//   npm run db:setup           check, then create the tables (runs migrations)
//   npm run db:setup -- --check   check only, change nothing
//
// Refuses to touch anything unless:
//  - it is connected to the expected database (BLR_DB_NAME, default "blr_chatbot") -- never the
//    Neon project's default database, which holds the older ElevenLabs-era tables;
//  - the database holds no tables other than this app's own.
// It only ever CREATEs tables (see src/server/db/migrations); it never drops or alters data.
// Connection strings are read from .env and never printed.

import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // fall through to the check below
}

const checkOnly = process.argv.includes("--check");
const expectedDb = process.env.BLR_DB_NAME || "blr_chatbot";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const ours = new Set(["conversations", "messages", "leads", "quotes", "distance_cache", "booking_settings", "trucks", "day_overrides", "bookings"]);

function fail(message) {
  console.error(`\n  STOPPED: ${message}\n`);
  process.exit(1);
}

if (!url) fail("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set in .env. See .env.example for where to get it.");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [{ db }] = await sql`select current_database() as db`;
  if (db !== expectedDb) {
    fail(`connected to database "${db}", expected "${expectedDb}". Fix the database name at the end of the connection string in .env.`);
  }

  const tables = (await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`).map(
    (r) => r.table_name,
  );
  const foreign = tables.filter((t) => !ours.has(t));
  if (foreign.length) {
    fail(`"${db}" already has tables this app didn't create (${foreign.join(", ")}). This doesn't look like the dedicated chatbot database -- nothing was changed.`);
  }

  const [{ tracked }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as tracked`;
  if (tables.length && !tracked) {
    fail(`"${db}" has some of this app's tables (${tables.join(", ")}) but no migration history -- created by hand? Nothing was changed.`);
  }

  console.log(`  Database: ${db}  (ok)`);
  console.log(`  Existing app tables: ${tables.length ? tables.join(", ") : "none"}`);

  if (checkOnly) {
    console.log("  Check only -- nothing changed. Run `npm run db:setup` to create the tables.");
  } else {
    await migrate(drizzle(sql), { migrationsFolder: path.join(root, "src/server/db/migrations") });
    const after = (await sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`).map((r) => r.table_name);
    console.log(`  Done. Tables now: ${after.join(", ")}`);
  }
} catch (err) {
  fail(err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/g, "[connection string hidden]") : String(err));
} finally {
  await sql.end({ timeout: 5 });
}
