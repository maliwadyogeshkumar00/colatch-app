// Finance reconciliation against a real Postgres (DATABASE_URL): each check finds a seeded broken deal and not a correct one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { transition } from "@/lib/net/dealflow";
import { reconcile, CHECKS } from "@/app/(net)/team/finance/reconcile.js";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const finance = { kind: "team", id: "fin@test", role: "finance" };
const shortlister = { kind: "team", id: "sl@test", role: "shortlist" };

async function makeDeal(extra = {}) {
  await ensureSchema();
  const creatorId = id("cr"), campaignId = id("k"), dealId = id("d");
  await db.prepare("INSERT INTO creators (id, handle, name) VALUES (?,?,?)").bind(creatorId, creatorId, "Test Creator").run();
  await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token) VALUES (?,?,?,?,?)").bind(campaignId, campaignId, "Test campaign", `${campaignId}@brand.test`, id("tok")).run();
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, brand, fee, stage, pay_status) VALUES (?,?,?,?,?,?,?)")
    .bind(dealId, creatorId, campaignId, "Brand", extra.fee ?? 20000, extra.stage ?? "shortlisted", extra.pay_status ?? "unfunded").run();
  return { creatorId, campaignId, dealId, creator: { kind: "creator", id: creatorId }, brand: { kind: "brand", id: campaignId } };
}
const hits = (res, key) => new Set(res.find((c) => c.key === key).rows.map((r) => r.id));

after(async () => { await closeDb(); });

test("five checks are defined", () => {
  assert.deepEqual(CHECKS.map((c) => c.key), ["paid_no_payout", "funded_no_payment", "orphan_ledger", "payout_over_fee", "funding_mismatch"]);
});

test("a deal marked paid with no ledger rows is flagged; a correctly recorded deal is not", async () => {
  const bad = await makeDeal({ stage: "paid", pay_status: "paid" });
  const good = await makeDeal();
  await transition(good.dealId, "accept_terms", good.creator);
  await transition(good.dealId, "record_funding", finance, { amount: "23540", reference: "FINUTR" + good.dealId.slice(-6) });
  await transition(good.dealId, "submit_draft", good.creator, { draft_url: "https://drive.google.com/file/abc" });
  await transition(good.dealId, "approve_draft", good.brand);
  await transition(good.dealId, "submit_live_link", good.creator, { post_url: "https://www.instagram.com/reel/xyz" });
  await transition(good.dealId, "verify_live", shortlister);
  await transition(good.dealId, "approve_payout", finance);
  await transition(good.dealId, "record_payout", finance, { amount: "18000", tds: "2000", utr: "PAYUTR" + good.dealId.slice(-6) });

  const res = await reconcile(db);
  assert.equal(res.length, 5);
  assert.ok(hits(res, "paid_no_payout").has(bad.dealId), "paid without payout is flagged");
  assert.ok(hits(res, "funded_no_payment").has(bad.dealId), "paid without brand payment is flagged");
  for (const c of res) assert.ok(!c.rows.some((r) => r.id === good.dealId), `correct deal must not appear in ${c.key}`);
});

test("payout above the fee and a funding mismatch are flagged", async () => {
  const x = await makeDeal({ fee: 10000 });
  await db.prepare("UPDATE creator_deals SET pay_status='paid', stage='paid', brand_paid_paise=? WHERE id=?").bind(1200000, x.dealId).run();
  await db.prepare("INSERT INTO finance_ledger (kind, deal_id, campaign_id, amount_paise, tds_paise, utr, actor_id, idempotency_key) VALUES (?,?,?,?,?,?,?,?)")
    .bind("brand_payment_received", x.dealId, x.campaignId, 1100000, 0, "IN" + x.dealId.slice(-6), "fin@test", id("idem")).run();
  await db.prepare("INSERT INTO finance_ledger (kind, deal_id, campaign_id, amount_paise, tds_paise, utr, actor_id, idempotency_key) VALUES (?,?,?,?,?,?,?,?)")
    .bind("creator_payout_sent", x.dealId, x.campaignId, 950000, 100000, "OUT" + x.dealId.slice(-6), "fin@test", id("idem")).run();
  const res = await reconcile(db);
  assert.ok(hits(res, "payout_over_fee").has(x.dealId), "9,500 + 1,000 TDS > 10,000 fee");
  assert.ok(hits(res, "funding_mismatch").has(x.dealId), "12,000 locked vs 11,000 recorded");
  assert.ok(!hits(res, "paid_no_payout").has(x.dealId));
});

test("ledger rows pointing at a missing deal are flagged", async () => {
  await ensureSchema();
  const ghost = id("ghost");
  await db.prepare("INSERT INTO finance_ledger (kind, deal_id, amount_paise, tds_paise, utr, actor_id, idempotency_key) VALUES (?,?,?,?,?,?,?)")
    .bind("adjustment", ghost, 100, 0, null, "fin@test", id("idem")).run();
  const res = await reconcile(db);
  assert.ok(hits(res, "orphan_ledger").has(ghost));
});
