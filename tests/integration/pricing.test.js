// Fee rules that read payment history from the database: repeat booking, loyalty ladder, frozen price,
// and how long a brand referral keeps earning. Real Postgres (DATABASE_URL); each test makes its own rows.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { env } from "@/lib/net/env";
import { brandFeePct, feePct } from "@/lib/net/deal";
import { priceDeal } from "@/lib/net/pricing";
import { transition } from "@/lib/net/dealflow";
import { REF } from "@/lib/net/referral";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const ts = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().replace("T", " ").slice(0, 19);
after(async () => { await closeDb(); });

async function creator() { const c = id("cr"); await db.prepare("INSERT INTO creators (id, handle, name) VALUES (?,?,?)").bind(c, c, "Pricing Test").run(); return c; }
async function campaign(email) { const k = id("k"); await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token) VALUES (?,?,?,?,?)").bind(k, k, "Pricing campaign", email, id("tok")).run(); return k; }
async function paidDeal(k, c, fee, daysAgo) {
  const d = id("d");
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, fee, stage, pay_status, paid_at) VALUES (?,?,?,?,?,?,?)").bind(d, c, k, fee, "paid", "paid", ts(daysAgo)).run();
  return d;
}

test("a new brand pays the standard fee", async () => {
  await ensureSchema();
  const r = await brandFeePct(env, `${id("new")}@brand.test`);
  assert.equal(r.pct, feePct(env));
  assert.equal(r.reason, null);
});

test("repeat booking: 12% when this brand already paid this creator through Colatch", async () => {
  const email = `${id("rep")}@brand.test`, c = await creator(), other = await creator();
  await paidDeal(await campaign(email), c, 30000, 30);
  const now = await campaign(email);
  const r = await brandFeePct(env, email, c, now);
  assert.equal(r.pct, 12);
  assert.ok(r.repeat);
  const notRepeat = await brandFeePct(env, email, other, now);
  assert.equal(notRepeat.pct, feePct(env), "a different creator is not a repeat booking");
});

test("repeat booking ignores deals on the current campaign", async () => {
  const email = `${id("same")}@brand.test`, c = await creator();
  const k = await campaign(email);
  await paidDeal(k, c, 30000, 5);
  const r = await brandFeePct(env, email, c, k);
  assert.equal(r.pct, feePct(env));
});

test("loyalty ladder: 1 point off per ₹5 lakh paid in the last 365 days, never below 10%", async () => {
  const base = feePct(env);
  const e1 = `${id("loy")}@brand.test`;
  await paidDeal(await campaign(e1), await creator(), 1_000_000, 100); // ₹10L → 2 points
  assert.equal((await brandFeePct(env, e1)).pct, Math.max(10, base - 2));
  const e2 = `${id("big")}@brand.test`;
  await paidDeal(await campaign(e2), await creator(), 9_000_000, 100); // ₹90L → floor
  assert.equal((await brandFeePct(env, e2)).pct, 10);
  const e3 = `${id("old")}@brand.test`;
  await paidDeal(await campaign(e3), await creator(), 9_000_000, 400); // older than a year
  assert.equal((await brandFeePct(env, e3)).pct, base);
});

test("price is live before funding and frozen after", async () => {
  const email = `${id("frz")}@brand.test`, c = await creator();
  const k = await campaign(email);
  const live = await priceDeal(env, { fee: 40000, creator_id: c }, { id: k, client_email: email });
  assert.equal(live.frozen, false);
  assert.equal(live.pct, feePct(env));
  const frozen = await priceDeal(env, { fee: 40000, fee_pct: 13, creator_id: c, brand_paid_paise: 4661360 }, { id: k, client_email: email });
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.pct, 13);
  assert.equal(frozen.paidPaise, 4661360);
  // Later loyalty or repeat history does not change a frozen price.
  await paidDeal(await campaign(email), c, 9_000_000, 10);
  const still = await priceDeal(env, { fee: 40000, fee_pct: 13, creator_id: c }, { id: k, client_email: email });
  assert.equal(still.pct, 13);
});

test(`brand referral earns for ${REF.months} months, then stops`, async () => {
  const finance = { kind: "team", id: "fin@test", role: "finance" };
  async function runPaid(email) {
    const c = await creator(), k = await campaign(email), d = id("d");
    await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, fee, stage) VALUES (?,?,?,?,?)").bind(d, c, k, 20000, "shortlisted").run();
    const cr = { kind: "creator", id: c }, br = { kind: "brand", id: k };
    await transition(d, "accept_terms", cr);
    await transition(d, "record_funding", finance, { amount: "23540", reference: "F" + d.slice(-8).toUpperCase() });
    await transition(d, "submit_draft", cr, { draft_url: "https://drive.google.com/x" });
    await transition(d, "approve_draft", br);
    await transition(d, "submit_live_link", cr, { post_url: "https://www.instagram.com/reel/x" });
    await transition(d, "verify_live", { kind: "team", id: "sl@test", role: "shortlist" });
    await transition(d, "approve_payout", finance);
    await transition(d, "record_payout", finance, { amount: "20000", utr: "P" + d.slice(-8).toUpperCase() });
    return d;
  }
  async function referred(daysAgo) {
    const owner = id("own"), code = id("C").toUpperCase(), email = `${id("ref")}@brandco.test`;
    await db.prepare("INSERT INTO referral_codes (code, owner_type, owner_id) VALUES (?,?,?)").bind(code, "creator", owner).run();
    await db.prepare("INSERT INTO referrals (id, code, referred_type, referred_id, created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), code, "brand", email, ts(daysAgo)).run();
    return { owner, email };
  }
  const fresh = await referred(30);
  await runPaid(fresh.email);
  const n1 = await db.prepare("SELECT COUNT(*) AS n FROM referral_earnings WHERE owner_id=? AND reason='brand_fee_share'").bind(fresh.owner).first();
  assert.equal(n1.n, 1, "inside the window: earns");
  const stale = await referred(Math.ceil(REF.months * 30.5) + 5);
  await runPaid(stale.email);
  const n2 = await db.prepare("SELECT COUNT(*) AS n FROM referral_earnings WHERE owner_id=?").bind(stale.owner).first();
  assert.equal(n2.n, 0, "after the window: nothing");
});
