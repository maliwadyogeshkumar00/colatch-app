// Brand-side pricing: quote() in lib/net/deal.ts. Amounts are whole rupees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, feePct, RUSH_PCT } from "@/lib/net/deal";

const env = {}; // no COLATCH_FEE_PCT set: the standard fee applies

test("standard fee is 15% when nothing is configured", () => {
  assert.equal(feePct(env), 15);
  assert.equal(feePct({ COLATCH_FEE_PCT: "abc" }), 15);
  assert.equal(feePct({ COLATCH_FEE_PCT: "75" }), 15, "out-of-range setting falls back to 15");
  assert.equal(feePct({ COLATCH_FEE_PCT: "13" }), 13);
});

test("standard quote: creator fee + 15% Colatch fee + 18% GST on Colatch's fee only", () => {
  const q = quote(env, 40000, false);
  assert.equal(q.pct, 15);
  assert.equal(q.colatch, 6000);
  assert.equal(q.gstOnColatch, 1080);
  assert.equal(q.gstOnCreator, 0);
  assert.equal(q.total, 47080);
});

test("repeat booking at 12% and a loyalty rate are passed in as the override", () => {
  const r = quote(env, 40000, false, 12);
  assert.equal(r.colatch, 4800);
  assert.equal(r.total, 40000 + 4800 + 864);
  const l = quote(env, 40000, false, 11);
  assert.equal(l.basePct, 11);
  assert.equal(l.colatch, 4400);
});

test("rush adds RUSH_PCT on top of the base fee, shown as its own line", () => {
  const q = quote(env, 40000, false, null, true);
  assert.equal(q.pct, 15 + RUSH_PCT);
  assert.equal(q.rushFee, Math.round((40000 * RUSH_PCT) / 100));
  assert.equal(q.colatch, Math.round((40000 * (15 + RUSH_PCT)) / 100));
  assert.equal(q.gstOnColatch, Math.round(q.colatch * 0.18));
});

test("creator GST is added only when the creator is GST-registered", () => {
  const q = quote(env, 40000, true);
  assert.equal(q.gstOnCreator, 7200);
  assert.equal(q.total, 40000 + 6000 + 1080 + 7200);
});

test("totals always add up and stay whole rupees", () => {
  for (const fee of [1, 999, 12345, 33333, 250000, 9999999]) {
    for (const [gst, pct, rush] of [[false, null, false], [true, 12, false], [false, 10, true], [true, null, true]]) {
      const q = quote(env, fee, gst, pct, rush);
      for (const k of ["colatch", "gstOnColatch", "gstOnCreator", "rushFee", "total"]) assert.ok(Number.isInteger(q[k]), `${k} for ${fee}`);
      assert.equal(q.total, q.creatorFee + q.colatch + q.gstOnColatch + q.gstOnCreator);
    }
  }
});
