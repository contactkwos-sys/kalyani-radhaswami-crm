#!/usr/bin/env node
/**
 * Apply SQL migrations via Supabase pooler (server-side only).
 * Usage: node scripts/apply-migration.js [path-to.sql]
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgresql://postgres.ixulyhomqtajenigopai:${encodeURIComponent(
    process.env.SUPABASE_DB_PASSWORD || ""
  )}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;

async function main() {
  const file =
    process.argv[2] ||
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20260811220000_phase1_foundation.sql"
    );

  if (!process.env.SUPABASE_DB_PASSWORD && !process.env.DATABASE_URL) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL required");
    process.exit(1);
  }

  const sql = fs.readFileSync(file, "utf8");
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected. Applying:", path.basename(file));
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migration applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
