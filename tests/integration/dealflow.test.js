// Runs the deal state machine against a real Postgres (DATABASE_URL). Each test makes its own rows.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { transition, FlowError, toPaise } from "@/lib/net/dealflow";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const finance = { kind: "team", id: "fin@test", role: "finance" };
const shortlister = { kind: "team", id: "sl@test", role: "shortlist" };
const viewer = { kind: "team", id: "view@test", role: "viewer" };
const admin = { kind: "team", id: "admin@test", role: "admin" };

async function makeDeal({ fee = 20000, email } = {}) {
  await ensureSchema();
  const creatorId = id("cr"), campaignId = id("k"), dealId = id("d");
  await db.prepare("INSERT INTO creators (id, handle, name) VALUES (?,?,?)").bind(creatorId, creatorId, "Test Creator").run();
  await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token) VALUES (?,?,?,?,?)").bind(campaignId, campaignId, "Test campaign", email || `${campaignId}@brand.test`, id("tok")).run();
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, brand, fee, stage) VALUES (?,?,?,?,?,?)").bind(dealId, creatorId, campaignId, "Brand", fee, "shortlisted").run();
  return { creatorId, campaignId, dealId, creator: { kind: "creator", id: creatorId }, brand: { kind: "brand", id: campaignId } };
}

async function rejects(p, code) {
  await assert.rejects(p, (e) => { assert.ok(e instanceof FlowError, `expected FlowError, got ${e?.message}`); if (code) assert.equal(e.code, code, e.message); return true; });
}

async function runToReleased(x) {
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "23540", reference: "BRANDUTR001" + x.dealId.slice(-4) });
  await transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/file/abc" });
  await transition(x.dealId, "approve_draft", x.brand);
  await transition(x.dealId, "submit_live_link", x.creator, { post_url: "https://www.instagram.com/reel/xyz" });
  await transition(x.dealId, "verify_live", shortlister);
  await transition(x.dealId, "approve_payout", finance);
}

after(async () => { await closeDb(); });

test("paise parsing is strict", () => {
  assert.equal(toPaise("18,000.50"), 1800050);
  assert.equal(toPaise("₹ 500"), 50000);
  assert.equal(toPaise("12.345"), null);
  assert.equal(toPaise("-5"), null);
  assert.equal(toPaise("1e5"), null);
});

test("full lifecycle: accept → fund → draft → approve → live → verify → release → pay", async () => {
  const x = await makeDeal();
  await runToReleased(x);
  const paid = await transition(x.dealId, "record_payout", finance, { amount: "18000", tds: "2000", utr: "payutr" + x.dealId.slice(-6) });
  assert.equal(paid.pay_status, "paid");
  assert.equal(paid.stage, "paid");
  assert.ok(paid.fee_pct != null, "price is frozen at funding");
  assert.equal(Number(paid.brand_paid_paise), 2354000);
  const ledger = await db.prepare("SELECT kind, amount_paise, tds_paise FROM finance_ledger WHERE deal_id=? ORDER BY id").bind(x.dealId).all();
  assert.deepEqual(ledger.results.map((r) => [r.kind, Number(r.amount_paise)]), [["brand_payment_received", 2354000], ["creator_payout_sent", 1800000]]);
  const events = await db.prepare("SELECT kind FROM deal_events WHERE deal_id=?").bind(x.dealId).all();
  assert.ok(events.results.length >= 8);
  const audits = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity_id=?").bind(x.dealId).first();
  assert.ok(audits.n >= 8);
});

test("a creator can't be paid twice, even with two payouts racing", async () => {
  const x = await makeDeal();
  await runToReleased(x);
  const utr = "race" + x.dealId.slice(-6);
  const results = await Promise.allSettled([
    transition(x.dealId, "record_payout", finance, { amount: "20000", utr: utr + "A" }),
    transition(x.dealId, "record_payout", finance, { amount: "20000", utr: utr + "B" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const n = await db.prepare("SELECT COUNT(*) AS n FROM finance_ledger WHERE deal_id=? AND kind='creator_payout_sent'").bind(x.dealId).first();
  assert.equal(n.n, 1);
  await rejects(transition(x.dealId, "record_payout", finance, { amount: "1", utr: utr + "C" }), "invalid_state");
});

test("the same bank reference can't be used for two payouts", async () => {
  const a = await makeDeal(), b = await makeDeal();
  await runToReleased(a); await runToReleased(b);
  const utr = "SAMEUTR" + a.dealId.slice(-6).toUpperCase();
  await transition(a.dealId, "record_payout", finance, { amount: "20000", utr });
  await rejects(transition(b.dealId, "record_payout", finance, { amount: "20000", utr }), "duplicate");
  const d = await db.prepare("SELECT pay_status FROM creator_deals WHERE id=?").bind(b.dealId).first();
  assert.equal(d.pay_status, "released", "the failed payout rolled back completely");
});

test("payout can't exceed the agreed fee", async () => {
  const x = await makeDeal({ fee: 10000 });
  await runToReleased(x);
  await rejects(transition(x.dealId, "record_payout", finance, { amount: "9500", tds: "1000", utr: "OVER" + x.dealId.slice(-6) }), "invalid_state");
});

test("steps out of order are refused", async () => {
  const x = await makeDeal();
  await rejects(transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/x" }), "invalid_state"); // terms not accepted
  await transition(x.dealId, "accept_terms", x.creator);
  await rejects(transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/x" }), "invalid_state"); // not funded
  await rejects(transition(x.dealId, "approve_payout", finance), "invalid_state");
  await rejects(transition(x.dealId, "record_payout", finance, { amount: "1", utr: "ABCDEF12" }), "invalid_state");
  await rejects(transition(x.dealId, "verify_live", shortlister), "invalid_state");
});

test("roles and owners are enforced (no IDOR)", async () => {
  const x = await makeDeal(), other = await makeDeal();
  await rejects(transition(x.dealId, "accept_terms", other.creator), "forbidden");           // another creator
  await rejects(transition(x.dealId, "record_funding", shortlister, { amount: "1", reference: "REF1234" }), "forbidden");
  await rejects(transition(x.dealId, "record_funding", viewer, { amount: "1", reference: "REF1234" }), "forbidden");
  await rejects(transition(x.dealId, "record_funding", x.creator, { amount: "1", reference: "REF1234" }), "forbidden");
  await rejects(transition(x.dealId, "cancel", finance, { reason: "nope" }), "forbidden");
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "100", reference: "FUND" + x.dealId.slice(-6) });
  await transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/x" });
  await rejects(transition(x.dealId, "approve_draft", other.brand), "forbidden");             // another brand's share link
  await rejects(transition(x.dealId, "approve_draft", finance), "forbidden");
});

test("unsafe links are refused", async () => {
  const x = await makeDeal();
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "100", reference: "FUND" + x.dealId.slice(-6) });
  await rejects(transition(x.dealId, "submit_draft", x.creator, { draft_url: "javascript:alert(1)" }), "invalid_state");
  await rejects(transition(x.dealId, "submit_draft", x.creator, { draft_url: "http://insecure.example/x" }), "invalid_state");
});

test("cancel and refund: funded deal can be refunded once; paid deal can't be cancelled", async () => {
  const x = await makeDeal();
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "500", reference: "FUND" + x.dealId.slice(-6) });
  await rejects(transition(x.dealId, "record_refund", finance, { amount: "500", utr: "REFUND01" }), "invalid_state");
  await transition(x.dealId, "cancel", admin, { reason: "brand pulled out" });
  await transition(x.dealId, "record_refund", finance, { amount: "500", utr: "RF" + x.dealId.slice(-6).toUpperCase() });
  await rejects(transition(x.dealId, "record_refund", finance, { amount: "500", utr: "RG" + x.dealId.slice(-6).toUpperCase() }), "invalid_state");

  const y = await makeDeal();
  await runToReleased(y);
  await rejects(transition(y.dealId, "cancel", admin, { reason: "too late" }), "invalid_state");
});

test("the ledger is append-only", async () => {
  const x = await makeDeal();
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "100", reference: "FUND" + x.dealId.slice(-6) });
  await assert.rejects(db.prepare("UPDATE finance_ledger SET amount_paise=1 WHERE deal_id=?").bind(x.dealId).run());
  await assert.rejects(db.prepare("DELETE FROM finance_ledger WHERE deal_id=?").bind(x.dealId).run());
});

test("referral earnings are booked once, with the payout", async () => {
  const email = `${id("brand")}@acme-brand.test`;
  const owner = id("refowner"), code = id("CODE").toUpperCase();
  await ensureSchema();
  await db.prepare("INSERT INTO referral_codes (code, owner_type, owner_id) VALUES (?,?,?)").bind(code, "creator", owner).run();
  const x = await makeDeal({ email });
  await db.prepare("INSERT INTO referrals (id, code, referred_type, referred_id) VALUES (?,?,?,?)").bind(crypto.randomUUID(), code, "brand", email).run();
  await db.prepare("INSERT INTO referrals (id, code, referred_type, referred_id) VALUES (?,?,?,?)").bind(crypto.randomUUID(), code, "creator", x.creatorId.toLowerCase()).run();
  await runToReleased(x);
  await transition(x.dealId, "record_payout", finance, { amount: "20000", utr: "REFPAY" + x.dealId.slice(-6).toUpperCase() });
  const rows = await db.prepare("SELECT reason, amount FROM referral_earnings WHERE owner_id=? ORDER BY reason").bind(owner).all();
  assert.deepEqual(rows.results.map((r) => r.reason), ["brand_fee_share", "creator_first_deal"]);
  assert.ok(rows.results.find((r) => r.reason === "brand_fee_share").amount > 0);

  // A second paid deal for the same creator gives no second first-deal bonus.
  const y = await makeDeal({ email });
  await db.prepare("UPDATE creator_deals SET creator_id=? WHERE id=?").bind(x.creatorId, y.dealId).run();
  await runToReleased({ ...y, creator: x.creator });
  await transition(y.dealId, "record_payout", finance, { amount: "20000", utr: "REFPAY" + y.dealId.slice(-6).toUpperCase() });
  const bonus = await db.prepare("SELECT COUNT(*) AS n FROM referral_earnings WHERE owner_id=? AND reason='creator_first_deal'").bind(owner).first();
  assert.equal(bonus.n, 1);
});

test("migrations are recorded and re-running is a no-op", async () => {
  await ensureSchema();
  const v = await db.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
  assert.ok(Number(v.value) >= 4);
});
