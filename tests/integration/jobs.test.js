// Scheduled jobs and outgoing webhooks against a real Postgres (DATABASE_URL). Each test makes its own rows.
// Other test files share the database and run at the same time, so the deal jobs are scoped to this file's
// deals, and every webhook made here is deleted at the end.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { transition } from "@/lib/net/dealflow";
import { runAll, sendReminders, usageExpiry, reminderKey } from "@/lib/net/jobs";
import { emit, retryDue, deliveryId, verifySignature, MAX_ATTEMPTS, sweepCreated } from "@/lib/net/webhooks";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const finance = { kind: "team", id: "fin@test", role: "finance" };
const hooks = [];
// .invalid never resolves (RFC 2606), so deliveries to it fail fast with no network traffic.
const DEAD = "https://colatch-jobs-test.invalid/hook";
const textTs = (d) => d.toISOString().replace("T", " ").slice(0, 19);

async function makeDeal(extra = {}) {
  await ensureSchema();
  const creatorId = id("cr"), campaignId = id("k"), dealId = id("d");
  await db.prepare("INSERT INTO creators (id, handle, name) VALUES (?,?,?)").bind(creatorId, creatorId, "Test Creator").run();
  await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token) VALUES (?,?,?,?,?)").bind(campaignId, campaignId, "Jobs campaign", `${campaignId}@brand.test`, id("tok")).run();
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, brand, fee, stage) VALUES (?,?,?,?,?,?)").bind(dealId, creatorId, campaignId, "Brand", 20000, "shortlisted").run();
  const cols = Object.keys(extra);
  if (cols.length) await db.prepare(`UPDATE creator_deals SET ${cols.map((c) => `${c}=?`).join(", ")} WHERE id=?`).bind(...cols.map((c) => extra[c]), dealId).run();
  return { creatorId, campaignId, dealId, creator: { kind: "creator", id: creatorId }, brand: { kind: "brand", id: campaignId } };
}

async function makeHook(url, events, active = true) {
  const hid = id("wh");
  await db.prepare("INSERT INTO webhooks (id, url, secret, events, active) VALUES (?,?,?,?,?)").bind(hid, url, "whsec_test_" + hid, events.join(","), active).run();
  hooks.push(hid);
  return hid;
}

after(async () => {
  for (const h of hooks) {
    await db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id=?").bind(h).run();
    await db.prepare("DELETE FROM webhooks WHERE id=?").bind(h).run();
  }
  await closeDb();
});

test("cron: overdue draft is auto-approved once through the state machine, and every job records its run", async () => {
  const x = await makeDeal();
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "100", reference: "JOBF" + x.dealId.slice(-6) });
  await transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/x", approve_hours: 1 });
  await db.prepare("UPDATE creator_deals SET auto_approve_at=? WHERE id=?").bind(new Date(Date.now() - 1000).toISOString(), x.dealId).run();
  const scope = { dealIds: [x.dealId] };

  const first = await runAll(new Date(), scope);
  assert.deepEqual(first.map((r) => r.job), ["auto_approve", "reminders", "usage_expiry", "webhook_catchup", "webhook_retries"]);
  assert.ok(first.every((r) => r.ok), JSON.stringify(first));
  assert.match(first[0].result, /^1 of 1 overdue/);
  const second = await runAll(new Date(), scope);
  assert.match(second[0].result, /^0 of 0 overdue/, "nothing left to approve");

  const d = await db.prepare("SELECT draft_status, auto_approve_at FROM creator_deals WHERE id=?").bind(x.dealId).first();
  assert.equal(d.draft_status, "approved");
  assert.equal(d.auto_approve_at, null);
  const n = await db.prepare("SELECT COUNT(*) AS n FROM deal_events WHERE deal_id=? AND kind='approved'").bind(x.dealId).first();
  assert.equal(n.n, 1);
  const audit = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id=? AND action='deal.auto_approve' AND actor_kind='system'").bind(x.dealId).first();
  assert.equal(audit.n, 1);
  const runs = await db.prepare("SELECT job, last_result FROM cron_runs WHERE job IN ('auto_approve','reminders','usage_expiry','webhook_retries','webhook_catchup')").all();
  assert.equal(runs.results.length, 5);
});

test("one failing job does not stop the others", async () => {
  const { runJob } = await import("@/lib/net/jobs");
  const r = await runJob("webhook_catchup", async () => { throw new Error("boom"); });
  assert.equal(r.ok, false);
  assert.match(r.result, /^error: boom/);
  const row = await db.prepare("SELECT last_result FROM cron_runs WHERE job='webhook_catchup'").first();
  assert.match(row.last_result, /boom/);
});

test("reminders: brand unpaid is sent once to brand and team, however often cron runs", async () => {
  const x = await makeDeal({ sow_accepted_at: textTs(new Date(Date.now() - 5 * 864e5)), stage: "negotiating" });
  const scope = { dealIds: [x.dealId] };
  await sendReminders(new Date(), scope);
  await sendReminders(new Date(), scope);
  await Promise.all([sendReminders(new Date(), scope), sendReminders(new Date(), scope)]);
  const d = await db.prepare("SELECT id, sow_accepted_at FROM creator_deals WHERE id=?").bind(x.dealId).first();
  const key = reminderKey("unpaid", d);
  const sent = await db.prepare("SELECT COUNT(*) AS n FROM reminders_sent WHERE key=?").bind(key).first();
  assert.equal(sent.n, 1);
  const notes = await db.prepare("SELECT to_kind, template FROM notifications WHERE dedupe_key IN (?, ?) ORDER BY to_kind").bind(`${key}:brand`, `${key}:team`).all();
  assert.deepEqual(notes.results.map((r) => [r.to_kind, r.template]), [["brand", "reminder_brand_unpaid"], ["team", "reminder_brand_unpaid_team"]]);
});

test("usage rights: 14-day warning and expiry are each sent once", async () => {
  const soon = await makeDeal({ stage: "paid", pay_status: "paid" });
  await db.prepare("UPDATE creator_deals SET usage_expires_at = now() + interval '5 days' WHERE id=?").bind(soon.dealId).run();
  const gone = await makeDeal({ stage: "paid", pay_status: "paid" });
  await db.prepare("UPDATE creator_deals SET usage_expires_at = now() - interval '2 hours' WHERE id=?").bind(gone.dealId).run();
  const scope = { dealIds: [soon.dealId, gone.dealId] };
  const r1 = await usageExpiry(new Date(), scope);
  const r2 = await usageExpiry(new Date(), scope);
  assert.match(r1, /1 expiring soon, 1 expired/);
  assert.match(r2, /0 expiring soon, 0 expired/);
  const rows = await db.prepare("SELECT template, to_kind FROM notifications WHERE dedupe_key ILIKE ? OR dedupe_key ILIKE ? ORDER BY template, to_kind")
    .bind(`usage_14d:${soon.dealId}:%`, `usage_0d:${gone.dealId}:%`).all();
  assert.deepEqual(rows.results.map((r) => `${r.template}/${r.to_kind}`), ["usage_expired/brand", "usage_expired/team", "usage_expiring/brand", "usage_expiring/team"]);
});

test("emit: one delivery row per matching active hook, deduped by key, retried on the backoff schedule", async () => {
  const want = await makeHook(DEAD, ["deal.created", "post.live"]);
  const other = await makeHook(DEAD, ["payout.sent"]);
  const off = await makeHook(DEAD, ["deal.created"], false);
  const key = id("dealkey");
  const n1 = await emit("deal.created", { deal_id: key, fee_paise: 100 }, { key });
  const n2 = await emit("deal.created", { deal_id: key, fee_paise: 100 }, { key });
  assert.ok(n1 >= 1);
  assert.equal(n2, 0, "same key twice is one delivery");
  const mine = await db.prepare("SELECT * FROM webhook_deliveries WHERE id=?").bind(deliveryId(want, "deal.created", key)).first();
  assert.ok(mine, "delivery row for the subscribed hook");
  assert.equal(mine.status, "pending");
  assert.equal(mine.attempts, 1);
  assert.match(mine.last_error, /^Blocked/);
  assert.equal(mine.payload.deal_id, key);
  for (const h of [other, off]) {
    const none = await db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id=?").bind(h).first();
    assert.equal(none.n, 0, "unsubscribed or disabled hooks get nothing");
  }

  // Not due yet (next attempt is 5 minutes after creation), then due.
  await retryDue(new Date());
  assert.equal((await db.prepare("SELECT attempts FROM webhook_deliveries WHERE id=?").bind(mine.id).first()).attempts, 1);
  await retryDue(new Date(Date.now() + 6 * 60_000));
  assert.equal((await db.prepare("SELECT attempts FROM webhook_deliveries WHERE id=?").bind(mine.id).first()).attempts, 2);

  // Last attempt fails for good.
  await db.prepare("UPDATE webhook_deliveries SET attempts=? WHERE id=?").bind(MAX_ATTEMPTS - 1, mine.id).run();
  await retryDue(new Date(Date.now() + 2 * 864e5));
  const last = await db.prepare("SELECT status, attempts FROM webhook_deliveries WHERE id=?").bind(mine.id).first();
  assert.equal(last.status, "failed");
  assert.equal(last.attempts, MAX_ATTEMPTS);
});

test("delivery: signed POST, delivered on 2xx; the deal state machine emits after commit", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  // A public IP literal needs no DNS; fetch is replaced, so nothing leaves the machine.
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response("ok", { status: 200 }); };
  try {
    const hid = await makeHook("https://203.0.113.10/colatch", ["campaign.created"]);
    const key = id("camp");
    await emit("campaign.created", { campaign_id: key }, { key });
    const row = await db.prepare("SELECT status, attempts, delivered_at FROM webhook_deliveries WHERE id=?").bind(deliveryId(hid, "campaign.created", key)).first();
    assert.equal(row.status, "delivered");
    assert.ok(row.delivered_at);
    const call = calls.find((c) => c.url.startsWith("https://203.0.113.10/"));
    assert.ok(call, "posted to the hook");
    assert.equal(call.init.redirect, "manual");
    const body = call.init.body;
    assert.equal(JSON.parse(body).event, "campaign.created");
    assert.ok(verifySignature("whsec_test_" + hid, body, call.init.headers["x-colatch-signature"]), "signature verifies with the hook secret");
    const hook = await db.prepare("SELECT last_status FROM webhooks WHERE id=?").bind(hid).first();
    assert.equal(hook.last_status, 200);

    // State machine wiring: funding, submit_draft and approve_draft produce events for this deal. Other test files
    // run transitions at the same time, so this hook points at a name that never resolves (no slow requests for them).
    const flow = await makeHook(DEAD, ["draft.submitted", "draft.approved", "deal.stage_changed"]);
    const x = await makeDeal();
    await transition(x.dealId, "accept_terms", x.creator);
    await transition(x.dealId, "record_funding", finance, { amount: "100", reference: "JOBW" + x.dealId.slice(-6) });
    await transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/y" });
    await transition(x.dealId, "approve_draft", x.brand);
    const evs = await db.prepare("SELECT event, status, payload FROM webhook_deliveries WHERE webhook_id=? ORDER BY created_at").bind(flow).all();
    const forDeal = evs.results.filter((r) => r.payload.deal_id === x.dealId);
    assert.deepEqual(forDeal.map((r) => r.event), ["deal.stage_changed", "draft.submitted", "draft.approved"]);
    assert.equal(forDeal[0].payload.from_stage, "shortlisted");
    assert.equal(forDeal[0].payload.to_stage, "confirmed");
    assert.ok(forDeal.every((r) => r.status === "pending"), "recorded and waiting for retry");
    assert.ok(!JSON.stringify(forDeal).includes("@brand.test"), "no contact details in payloads");

    // Catch-up sweep: a brief created after the hook is sent once, even across runs.
    const sweepHook = await makeHook("https://203.0.113.10/sweep", ["campaign.created"]);
    const k = id("ksweep");
    await db.prepare("INSERT INTO campaigns (id, slug, title, status, source) VALUES (?,?,?,'pending','client')").bind(k, k, "Swept brief").run();
    await sweepCreated(new Date());
    await sweepCreated(new Date());
    const swept = await db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id=? AND event='campaign.created' AND payload->>'campaign_id' = ?").bind(sweepHook, k).first();
    assert.equal(swept.n, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
