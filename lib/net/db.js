// Database adapter for Colatch Connect.
//
// The queries were first written for SQLite (Cloudflare D1), so they keep that shape:
//   db.prepare(sql).bind(...).first() / .all() / .run()
// and translate() rewrites the SQLite-isms to Postgres.
//
// It talks to Postgres through `pg`, which works the same against Neon (live) and a plain
// Postgres (tests/CI). That gives real transactions: db.tx(async (t) => { ... }) runs every
// statement on one connection between BEGIN and COMMIT, and rolls back on any error.
import pg from "pg";
import { SCHEMA, MIGRATIONS } from "./schema";
import { translate } from "./sql";
export { translate };

// Postgres returns bigint/numeric as strings; the app expects numbers (counts, sums, averages).
const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
function fix(rows, fields) {
  const numeric = (fields || []).filter((f) => NUMERIC_OIDS.has(f.dataTypeID)).map((f) => f.name);
  if (!numeric.length) return rows;
  for (const r of rows) for (const k of numeric) if (r[k] != null && typeof r[k] === "string") r[k] = Number(r[k]);
  return rows;
}

let _pool = null;
function pool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    _pool = new pg.Pool({
      connectionString: url,
      // Serverless functions are short-lived: keep the pool small and let idle connections go.
      max: Number(process.env.DB_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: local ? false : { rejectUnauthorized: true },
    });
    _pool.on("error", (e) => console.error("[db] idle client error", e?.message));
  }
  return _pool;
}

// ---------------------------------------------------------------- schema and migrations
let _ready = null;

/** Highest migration version the code knows. Schema v1-v3 came from the original idempotent list. */
export const SCHEMA_VERSION = Math.max(3, ...MIGRATIONS.map((m) => m.version));

export async function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const c = await pool().connect();
      try {
        const have = await c
          .query("SELECT value FROM app_settings WHERE key='schema_version'")
          .then((r) => Number(r.rows?.[0]?.value || 0))
          .catch(() => 0);
        if (have >= SCHEMA_VERSION) return;
        // One instance migrates at a time; the others wait here and then see the new version.
        await c.query("SELECT pg_advisory_lock(727001)");
        try {
          const now = await c
            .query("SELECT value FROM app_settings WHERE key='schema_version'")
            .then((r) => Number(r.rows?.[0]?.value || 0))
            .catch(() => 0);
          if (now < 3) for (const stmt of SCHEMA) await c.query(stmt);
          let v = Math.max(now, 3);
          for (const m of MIGRATIONS.filter((m) => m.version > v).sort((a, b) => a.version - b.version)) {
            await c.query("BEGIN");
            try {
              for (const stmt of m.statements) await c.query(stmt);
              await c.query(
                "INSERT INTO app_settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                [String(m.version)]
              );
              await c.query("COMMIT");
            } catch (e) {
              await c.query("ROLLBACK");
              throw new Error(`Migration ${m.version} failed: ${e.message}`);
            }
            v = m.version;
          }
          await c.query(
            "INSERT INTO app_settings (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            [String(Math.max(v, 3))]
          );
        } finally {
          await c.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
        }
      } finally {
        c.release();
      }
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

// ---------------------------------------------------------------- statements
async function exec(runner, text, params) {
  const sqlText = translate(text);
  // SQLite stored booleans as 0/1 and accepted '' in number columns; Postgres does neither.
  const vals = params.map((p) => (p === undefined ? null : p === true ? 1 : p === false ? 0 : p));
  let res;
  try {
    res = await runner.query(sqlText, vals);
  } catch (e) {
    // Only outside a transaction: a failed statement inside one aborts it, so retrying would hide the error.
    if (e?.code !== "22P02" || !vals.includes("") || runner.__inTx) throw e;
    res = await runner.query(sqlText, vals.map((v) => (v === "" ? null : v)));
  }
  return { rows: fix(res.rows || [], res.fields), rowCount: res.rowCount ?? 0 };
}

class Stmt {
  constructor(runner, text, params = []) { this.runner = runner; this.text = text; this.params = params; }
  bind(...params) { return new Stmt(this.runner, this.text, params); }
  async #go() { if (!this.runner.__inTx) await ensureSchema(); return exec(this.runner.__inTx ? this.runner : pool(), this.text, this.params); }
  async first(col) { const { rows } = await this.#go(); const r = rows[0] ?? null; return col ? (r ? r[col] : null) : r; }
  async all() { const { rows } = await this.#go(); return { results: rows }; }
  async run() { const { rows, rowCount } = await this.#go(); return { meta: { changes: rowCount }, results: rows }; }
}

function makeDb(runner) {
  return {
    prepare: (text) => new Stmt(runner, text),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
}

export const db = {
  ...makeDb({ __inTx: false }),
  /**
   * Run fn inside one transaction. fn gets a db-shaped object (prepare/bind/first/all/run) bound
   * to the transaction. Throwing inside fn rolls everything back; the error is re-thrown.
   * Serialisation failures and deadlocks are retried up to 3 times.
   */
  async tx(fn) {
    await ensureSchema();
    for (let attempt = 1; ; attempt++) {
      const c = await pool().connect();
      c.__inTx = true;
      try {
        await c.query("BEGIN");
        const out = await fn(makeDb(c));
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        if ((e?.code === "40001" || e?.code === "40P01") && attempt < 3) continue;
        throw e;
      } finally {
        c.__inTx = false;
        c.release();
      }
    }
  },
};

/** For tests: close the pool so the process can exit. */
export async function closeDb() { if (_pool) { await _pool.end(); _pool = null; _ready = null; } }
