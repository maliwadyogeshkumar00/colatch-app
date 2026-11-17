import { test } from "node:test";
import assert from "node:assert/strict";
import { changeLines, actionTitle, areaOf, parseDetail, istStamp } from "@/components/admin/audit";
import { pageOf, pageHref } from "@/components/admin/Pager";

test("deal steps read as before → after lines, with money in rupees", () => {
  const d = JSON.stringify({ before: { stage: "draft", pay_status: "funded", draft_status: "approved" }, set: { stage: "live" } });
  assert.deepEqual(changeLines("deal.verify_live", d), ["Stage: draft → live"]);
  const fee = { before: { fee: 40000 }, set: { fee: 45000 } };
  assert.deepEqual(changeLines("deal.terms", fee), ["Fee: ₹40,000 → ₹45,000"]);
  const pay = { before: { pay_status: "released" }, set: { pay_status: "paid" }, ledger: { kind: "creator_payout_sent", amount_paise: 4000000 } };
  assert.deepEqual(changeLines("deal.record_payout", pay), ["Payment: released → paid", "Ledger: creator payout sent ₹40,000"]);
});

test("role and status moves, flat facts, and text that isn't JSON", () => {
  assert.deepEqual(changeLines("team.role_changed", { from: "viewer", to: "finance" }), ["Role: viewer → finance"]);
  assert.deepEqual(changeLines("notification.retry_all", '{"tried":12,"sent":0}'), ["Tried: 12", "Sent: 0"]);
  assert.deepEqual(changeLines("referral_earning.paid", { amount: 1000, kind: "cash", utr: "HDFC0001234" }), ["Amount: ₹1,000", "Type: cash", "Bank ref: …1234"]);
  assert.deepEqual(changeLines("x.y", "not json"), ["not json"]);
  assert.deepEqual(changeLines("x.y", null), []);
  assert.equal(parseDetail(""), null);
});

test("titles, areas and IST stamps", () => {
  assert.equal(actionTitle("team.login"), "Signed in");
  assert.equal(actionTitle("deal.verify_live"), "Verified the live post");
  assert.equal(actionTitle("deal.some_new_step"), "Deal · some new step");
  assert.equal(areaOf("deal.record_payout").key, "deals");
  assert.equal(areaOf("finance.export").key, "money");
  assert.equal(areaOf("zzz.q").key, "other");
  assert.equal(istStamp("2026-11-17 06:00:00"), "17 Nov 2026, 11:30");
  assert.equal(istStamp("2026-11-17"), "17 Nov 2026");
});

test("pager keeps filters and drops page 1 from the URL", () => {
  assert.equal(pageOf({ page: "3" }), 3);
  assert.equal(pageOf({ page: "-2" }), 1);
  assert.equal(pageOf({ page: "abc" }), 1);
  assert.equal(pageHref({ status: "failed", empty: "" }, 2), "?status=failed&page=2");
  assert.equal(pageHref({ kind: "adjustment" }, 1, "ledger"), "?kind=adjustment#ledger");
  assert.equal(pageHref({}, 1), "?");
});
