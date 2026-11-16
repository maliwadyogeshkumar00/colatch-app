import { test } from "node:test";
import assert from "node:assert/strict";
import { translate } from "@/lib/net/sql";

test("placeholders become numbered and skip quoted text", () => {
  assert.equal(translate("SELECT * FROM t WHERE a=? AND b='what?' AND c=?"), "SELECT * FROM t WHERE a=$1 AND b='what?' AND c=$2");
});
test("SQLite dates and functions become Postgres", () => {
  assert.match(translate("UPDATE t SET at=datetime('now')"), /to_char\(now\(\) at time zone 'utc'/);
  assert.match(translate("SELECT datetime('now','-7 days')"), /interval '-7 days'/);
  assert.match(translate("SELECT IFNULL(a,0)"), /COALESCE\(a,0\)/);
  assert.match(translate("SELECT julianday(x)"), /extract\(epoch from \(x\)::timestamp\)/);
});
test("INSERT OR IGNORE becomes ON CONFLICT DO NOTHING", () => {
  assert.equal(translate("INSERT OR IGNORE INTO t (a) VALUES (?)"), "INSERT INTO t (a) VALUES ($1) ON CONFLICT DO NOTHING");
});
test("LIKE is case-insensitive like SQLite", () => {
  assert.match(translate("SELECT * FROM t WHERE a LIKE ?"), /ILIKE \$1/);
});
