// SQLite-dialect to Postgres translation, kept separate so it can be unit-tested without a database.
const NOW = "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')";

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

