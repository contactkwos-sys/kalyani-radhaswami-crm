#!/usr/bin/env node
/**
 * Apply SQL migrations via Supabase pooler (server-side only).
 * Usage:
 *   node scripts/apply-migration.js                 # all files in supabase/migrations
 *   node scripts/apply-migration.js path/to.sql     # single file
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://postgres.ixulyhomqtajenigopai:${encodeURIComponent(
    process.env.SUPABASE_DB_PASSWORD || ""
  )}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;

async function apply(client, file) {
  const sql = fs.readFileSync(file, "utf8");
  console.log("Applying:", path.basename(file));
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.crm_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(
      `INSERT INTO public.crm_schema_migrations (filename) VALUES ($1)
       ON CONFLICT (filename) DO NOTHING`,
      [path.basename(file)]
    );
    await client.query("COMMIT");
    console.log("OK:", path.basename(file));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD && !process.env.DATABASE_URL) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required");
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    if (process.argv[2]) {
      await apply(client, path.resolve(process.argv[2]));
    } else {
      const dir = path.join(__dirname, "..", "supabase", "migrations");
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.crm_schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const { rows } = await client.query(
        `SELECT filename FROM public.crm_schema_migrations`
      );
      const done = new Set(rows.map((r) => r.filename));
      for (const f of files) {
        if (done.has(f)) {
          console.log("Skip (already applied):", f);
          continue;
        }
        await apply(client, path.join(dir, f));
      }
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
