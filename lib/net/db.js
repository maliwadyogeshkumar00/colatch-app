// D1-style database adapter over Neon Postgres (HTTP driver), so the ported
// queries keep their shape: db.prepare(sql).bind(...).first() / .all() / .run().
// SQLite-isms used by the original build are rewritten to Postgres here.
import { neon } from "@neondatabase/serverless";
import { SCHEMA } from "./schema";

const NOW = "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')";
let _sql = null;
let _ready = null;

function client() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

/** Turn the SQLite dialect the code was written in into Postgres. */
export function translate(text) {
  let s = text;
  // datetime('now', '+41 hours') / datetime('now','-5 days') / datetime('now')
  s = s.replace(/datetime\('now'\s*,\s*'([+-]?\d+)\s+(\w+)'\)/gi, (_, n, unit) => `to_char(now() at time zone 'utc' + interval '${n} ${unit}','YYYY-MM-DD HH24:MI:SS')`);
  s = s.replace(/datetime\('now'\)/gi, NOW);
  s = s.replace(/julianday\(([^)]+)\)/gi, (_, x) => `(extract(epoch from (${x})::timestamp)/86400.0)`);
  s = s.replace(/\bIFNULL\(/gi, "COALESCE(");
  s = s.replace(/\bLIKE\b/g, "ILIKE").replace(/\blike\b/g, "ILIKE");
  s = s.replace(/group_concat\(/gi, "string_agg(");
  let orIgnore = false;
  s = s.replace(/INSERT OR IGNORE INTO/gi, () => { orIgnore = true; return "INSERT INTO"; });
  s = s.replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO");
  if (orIgnore && !/ON CONFLICT/i.test(s)) s = s.replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  // ? placeholders -> $1..$n (skip anything inside single-quoted strings)
  let i = 0, out = "", inStr = false;
  for (const ch of s) {
    if (ch === "'") inStr = !inStr;
    if (ch === "?" && !inStr) { out += "$" + ++i; continue; }
    out += ch;
  }
  return out;
}

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
function fix(rows, fields) {
  const numeric = (fields || []).filter((f) => NUMERIC_OIDS.has(f.dataTypeID)).map((f) => f.name);
  if (!numeric.length) return rows;
  for (const r of rows) for (const k of numeric) if (r[k] != null && typeof r[k] === "string") r[k] = Number(r[k]);
  return rows;
}

/** Bump when lib/net/schema.js gains tables or columns; every statement there must be idempotent. */
export const SCHEMA_VERSION = 3;

export async function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const sql = client();
      const have = await sql
        .query("SELECT value FROM app_settings WHERE key='schema_version'")
        .then((r) => Number(r?.[0]?.value || 0))
        .catch(() => 0);
      if (have >= SCHEMA_VERSION) return;
      for (const stmt of SCHEMA) await sql.query(stmt);
      await sql.query(
        "INSERT INTO app_settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [String(SCHEMA_VERSION)]
      );
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

async function exec(text, params) {
  await ensureSchema();
  const sqlText = translate(text);
  // SQLite stored booleans as 0/1 and accepted '' in number columns; Postgres does neither.
  const vals = params.map((p) => (p === undefined ? null : p === true ? 1 : p === false ? 0 : p));
  let res;
  try {
    res = await client().query(sqlText, vals, { fullResults: true });
  } catch (e) {
    if (e?.code !== "22P02" || !vals.includes("")) throw e;
    res = await client().query(sqlText, vals.map((v) => (v === "" ? null : v)), { fullResults: true });
  }
  return { rows: fix(res.rows || [], res.fields), rowCount: res.rowCount ?? 0 };
}

class Stmt {
  constructor(text, params = []) { this.text = text; this.params = params; }
  bind(...params) { return new Stmt(this.text, params); }
  async first(col) { const { rows } = await exec(this.text, this.params); const r = rows[0] ?? null; return col ? (r ? r[col] : null) : r; }
  async all() { const { rows } = await exec(this.text, this.params); return { results: rows }; }
  async run() { const { rowCount } = await exec(this.text, this.params); return { meta: { changes: rowCount } }; }
}

export const db = {
  prepare: (text) => new Stmt(text),
  batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
};
