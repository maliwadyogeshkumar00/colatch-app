import { test } from "node:test";
import assert from "node:assert/strict";
import { railIndex, takeHome } from "@/lib/net/deal";

test("progress rail stops at the first step that isn't done", () => {
  assert.equal(railIndex({ sow_accepted_at: "x", pay_status: "unfunded", draft_status: "approved", live_at: "x" }), 0);
  assert.equal(railIndex({ sow_accepted_at: null, pay_status: "funded" }), -1);
  assert.ok(railIndex({ sow_accepted_at: "x", pay_status: "paid", draft_status: "approved", live_at: "x" }) >= 3);
});

test("TDS estimate follows the configured rate and threshold", () => {
  delete process.env.TDS_PCT; delete process.env.TDS_THRESHOLD;
  assert.equal(takeHome(10000, 0).tds, 0);
  assert.equal(takeHome(60000, 0).tds, 6000);
  process.env.TDS_PCT = "2"; process.env.TDS_THRESHOLD = "30000";
  assert.equal(takeHome(40000, 0).tds, 800);
  delete process.env.TDS_PCT; delete process.env.TDS_THRESHOLD;
});
