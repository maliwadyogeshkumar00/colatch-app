// A live database that already holds duplicate rows must still migrate: the unique index that
// can't be built is skipped and reported, instead of failing every request on the site.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { SCHEMA } from "@/lib/net/schema";

const base = process.env.DATABASE_URL;
const name = `mig_${Date.now()}`;
const url = base.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const admin = new pg.Pool({ connectionString: base });

after(async () => { const { closeDb } = await import("@/lib/net/db"); await closeDb(); await admin.query(`DROP DATABASE IF EXISTS ${name}`).catch(() => {}); await admin.end(); });

test("v3 database with duplicate deals migrates and reports the conflict", async () => {
  await admin.query(`CREATE DATABASE ${name}`);
  const c = new pg.Pool({ connectionString: url });
  for (const s of SCHEMA) await c.query(s);
  await c.query("INSERT INTO app_settings (key, value) VALUES ('schema_version','3') ON CONFLICT (key) DO UPDATE SET value='3'");
  await c.query("INSERT INTO creator_deals (id, creator_id, application_id) VALUES ('d1','c1','app1'), ('d2','c1','app1')");
  await c.end();

  process.env.DATABASE_URL = url;
  const { ensureSchema, db } = await import("@/lib/net/db");
  await ensureSchema();
  const v = await db.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
  assert.ok(Number(v.value) >= 4);
  const w = await db.prepare("SELECT value FROM app_settings WHERE key='migration_warnings'").first();
  assert.match(w.value, /idx_deals_one_per_application/);
  const ledger = await db.prepare("SELECT to_regclass('finance_ledger') AS t").first();
  assert.ok(ledger.t, "the rest of the migration still applied");
});
