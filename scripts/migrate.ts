#!/usr/bin/env tsx
/**
 * Tiny migration runner for Orbit. Reads supabase/migrations/*.sql in
 * filename order, applies any that haven't run yet, tracks completion in
 * a `_orbit_migrations` table.
 *
 * Connection: looks at SUPABASE_DB_URL > DATABASE_URL > POSTGRES_URL.
 * Use the Supabase pooler URL (Transaction mode) for the best results.
 *
 * Usage:
 *   npm run migrate          # apply all pending
 *   npm run migrate -- --dry # show what would run
 *   npm run migrate -- --force file=0006_v3_csv_first.sql  # re-run one
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

// dotenv/config defaults to .env. Next.js convention puts secrets in
// .env.local — load both so either layout works.
loadDotenv({ path: ".env.local" });
loadDotenv();

const MIG_DIR = path.resolve(process.cwd(), "supabase/migrations");
const TABLE = "_orbit_migrations";

function pickConnectionString(): string {
  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  const url = candidates.find((c) => typeof c === "string" && c.length > 0);
  if (!url) {
    throw new Error(
      "No DB connection string found. Set SUPABASE_DB_URL in .env.local " +
        "(grab it from Supabase Dashboard → Project Settings → Database → " +
        "Connection string → URI under 'Transaction pooler').",
    );
  }
  return url;
}

function listMigrations(): string[] {
  if (!fs.existsSync(MIG_DIR)) return [];
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(
    `create table if not exists ${TABLE} (
      name text primary key,
      applied_at timestamptz not null default now()
    );`,
  );
}

async function alreadyApplied(client: Client): Promise<Set<string>> {
  const r = await client.query<{ name: string }>(
    `select name from ${TABLE} order by name`,
  );
  return new Set(r.rows.map((row) => row.name));
}

function readSql(name: string): string {
  return fs.readFileSync(path.join(MIG_DIR, name), "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const forceArg = args.find((a) => a.startsWith("--force"));
  const forceFile = forceArg
    ? args[args.indexOf(forceArg) + 1] ?? null
    : null;

  const url = pickConnectionString();
  console.log(`migrate: connecting to ${url.replace(/:[^:@]+@/, ":***@")}`);
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const applied = await alreadyApplied(client);
    const all = listMigrations();
    const pending = forceFile
      ? all.filter((f) => f === forceFile)
      : all.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(
        `migrate: nothing to do (${applied.size} migrations already applied)`,
      );
      return;
    }

    console.log(`migrate: ${pending.length} migration(s) pending`);
    for (const name of pending) {
      console.log(`  - ${name}${dryRun ? " (dry)" : ""}`);
    }
    if (dryRun) return;

    for (const name of pending) {
      const sql = readSql(name);
      const t0 = Date.now();
      console.log(`migrate: applying ${name}…`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          `insert into ${TABLE} (name) values ($1)
           on conflict (name) do update set applied_at = now()`,
          [name],
        );
        await client.query("commit");
        console.log(`migrate: ✓ ${name} in ${Date.now() - t0}ms`);
      } catch (err) {
        await client.query("rollback").catch(() => {});
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`migrate: ✗ ${name} — ${msg}`);
        throw err;
      }
    }
    console.log("migrate: done");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
