import { test } from "node:test";
import assert from "node:assert/strict";
import { remindersFor, reminderKey, parseTime, reminderCfg, JOB_NAMES } from "@/lib/net/jobs";
import { render } from "@/lib/net/notify";

const now = new Date("2026-11-17T06:00:00Z");
const cfg = { unpaidDays: 3, draftDueDays: 2, payoutStuckDays: 3, usageWarnDays: 14, staleDays: 14 };
const base = { id: "d1", stage: "confirmed", pay_status: "funded", draft_status: "none", sow_accepted_at: "2026-11-01 10:00:00", go_live_date: null, live_at: null, post_url: null, released_at: null, usage_expires_at: null };

test("time columns: UTC text, ISO and plain dates (IST midnight)", () => {
  assert.equal(parseTime("2026-11-17 06:00:00"), Date.parse("2026-11-17T06:00:00Z"));
  assert.equal(parseTime("2026-11-17T06:00:00.000Z"), Date.parse("2026-11-17T06:00:00Z"));
  assert.equal(parseTime("2026-11-18"), Date.parse("2026-11-17T18:30:00Z"));
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("soon"), null);
});

test("brand unpaid: only after N days, only while unfunded", () => {
  const d = { ...base, pay_status: "unfunded", sow_accepted_at: "2026-11-15 06:00:00" };
  assert.deepEqual(remindersFor(d, now, cfg), [], "2 days is too early");
  assert.deepEqual(remindersFor({ ...d, sow_accepted_at: "2026-11-14 05:00:00" }, now, cfg), ["unpaid"]);
  assert.deepEqual(remindersFor({ ...d, sow_accepted_at: "2026-11-14 05:00:00", stage: "cancelled" }, now, cfg), []);
  assert.deepEqual(remindersFor({ ...d, sow_accepted_at: "2026-09-01 05:00:00" }, now, cfg), [], "stale deals are not reminded");
});

test("draft due soon and post due", () => {
  assert.deepEqual(remindersFor({ ...base, go_live_date: "2026-11-25" }, now, cfg), []);
  assert.deepEqual(remindersFor({ ...base, go_live_date: "2026-11-19" }, now, cfg), ["draft_due"]);
  assert.deepEqual(remindersFor({ ...base, draft_status: "submitted", go_live_date: "2026-11-19" }, now, cfg), [], "draft already in");
  assert.deepEqual(remindersFor({ ...base, pay_status: "unfunded", go_live_date: "2026-11-19" }, now, cfg).includes("draft_due"), false, "creator can't upload before funding");
  assert.deepEqual(remindersFor({ ...base, draft_status: "approved", go_live_date: "2026-11-17" }, now, cfg), ["post_due"]);
  assert.deepEqual(remindersFor({ ...base, draft_status: "approved", go_live_date: "2026-11-17", post_url: "https://instagram.com/p/x" }, now, cfg), [], "link already pasted");
});

test("payout approved but not sent after 3 days", () => {
  const d = { ...base, pay_status: "released", draft_status: "approved", live_at: "2026-11-05 10:00:00" };
  assert.deepEqual(remindersFor({ ...d, released_at: "2026-11-15 10:00:00" }, now, cfg), []);
  assert.deepEqual(remindersFor({ ...d, released_at: "2026-11-13 10:00:00" }, now, cfg), ["payout_stuck"]);
  assert.deepEqual(remindersFor({ ...d, pay_status: "paid", released_at: "2026-11-13 10:00:00" }, now, cfg), []);
});

test("usage rights: 14-day warning, then on expiry, then quiet", () => {
  const d = { ...base, stage: "paid", pay_status: "paid" };
  assert.deepEqual(remindersFor({ ...d, usage_expires_at: new Date("2026-12-10T00:00:00Z") }, now, cfg), []);
  assert.deepEqual(remindersFor({ ...d, usage_expires_at: new Date("2026-11-28T00:00:00Z") }, now, cfg), ["usage_14d"]);
  assert.deepEqual(remindersFor({ ...d, usage_expires_at: new Date("2026-11-17T05:00:00Z") }, now, cfg), ["usage_0d"]);
  assert.deepEqual(remindersFor({ ...d, usage_expires_at: new Date("2026-11-01T00:00:00Z") }, now, cfg), []);
});

test("reminder dedupe keys are stable and change only when the date they depend on changes", () => {
  const d = { id: "d1", sow_accepted_at: "2026-11-14 05:00:00", go_live_date: "2026-11-19", usage_expires_at: new Date("2026-11-28T00:00:00Z"), released_at: "2026-11-13 10:00:00" };
  assert.equal(reminderKey("unpaid", d), "unpaid:d1:2026-11-14");
  assert.equal(reminderKey("draft_due", d), "draft_due:d1:2026-11-18"); // midnight IST on the 19th is the 18th in UTC
  assert.equal(reminderKey("post_due", d), "post_due:d1:2026-11-18");
  assert.equal(reminderKey("payout_stuck", d), "payout_stuck:d1:2026-11-13");
  assert.equal(reminderKey("usage_14d", d), "usage_14d:d1:2026-11-28");
  assert.equal(reminderKey("usage_0d", d), "usage_0d:d1:2026-11-28");
  assert.equal(reminderKey("unpaid", d), reminderKey("unpaid", { ...d }), "same input, same key");
  assert.notEqual(reminderKey("draft_due", d), reminderKey("draft_due", { ...d, go_live_date: "2026-11-22" }), "moved date can be reminded again");
  assert.notEqual(reminderKey("usage_14d", d), reminderKey("usage_0d", d));
  const keys = ["unpaid", "draft_due", "post_due", "payout_stuck", "usage_14d", "usage_0d"].map((k) => reminderKey(k, d));
  assert.equal(new Set(keys).size, keys.length, "kinds never collide");
});

test("reminder templates render with no undefined", () => {
  const p = { name: "Asha", title: "Diwali reels", dealId: "d1", creator: "Simran", days: 4, due: "19 Nov 2026", amount: "₹10,000", token: "tok", expires: "28 Nov 2026", channels: "Instagram ads" };
  for (const t of ["reminder_brand_unpaid", "reminder_brand_unpaid_team", "reminder_draft_due", "reminder_post_due", "reminder_payout_stuck", "usage_expiring", "usage_expired"]) {
    for (const team of [false, true]) {
      const r = render(t, { ...p, team });
      assert.ok(r.subject && r.text, t);
      assert.ok(!/undefined|null/.test(r.subject + r.text), `${t} has undefined`);
    }
  }
  assert.match(render("usage_expiring", { ...p, team: true }).text, /\/team\/deals\/d1/);
  assert.match(render("usage_expiring", p).text, /\/shortlist\/tok/);
});

test("defaults and job list", () => {
  delete process.env.REMINDER_UNPAID_DAYS;
  assert.equal(reminderCfg().unpaidDays, 3);
  assert.deepEqual([...JOB_NAMES], ["auto_approve", "reminders", "usage_expiry", "webhook_retries", "webhook_catchup"]);
});
