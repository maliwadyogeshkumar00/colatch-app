// Email verification tokens (lib/net/security.ts): single use, only verify the email they were sent to,
// and a new link cancels the old one.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { createVerifyToken, consumeVerifyToken } from "@/lib/net/security";

after(async () => { await closeDb(); });

async function brand() {
  await ensureSchema();
  const id = `it-ba-${crypto.randomUUID()}`;
  const email = `${id}@verify.test`;
  await db.prepare("INSERT INTO brand_accounts (id, email, password_hash, salt) VALUES (?,?,'x','y')").bind(id, email).run();
  return { id, email };
}
const verifiedAt = async (id) => (await db.prepare("SELECT email_verified_at FROM brand_accounts WHERE id=?").bind(id).first())?.email_verified_at ?? null;

test("a verify link works once and marks the email confirmed", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  assert.equal(await verifiedAt(b.id), null);
  const who = await consumeVerifyToken(raw);
  assert.deepEqual({ kind: who?.user_kind, id: who?.user_id }, { kind: "brand", id: b.id });
  assert.notEqual(await verifiedAt(b.id), null);
  assert.equal(await consumeVerifyToken(raw), null, "second use is refused");
});

test("a newer link cancels the older one", async () => {
  const b = await brand();
  const first = await createVerifyToken("brand", b.id, b.email);
  const second = await createVerifyToken("brand", b.id, b.email);
  assert.equal(await consumeVerifyToken(first), null);
  assert.ok(await consumeVerifyToken(second));
});

test("a link for an old email does not confirm a changed email", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  await db.prepare("UPDATE brand_accounts SET email=? WHERE id=?").bind(`changed-${b.email}`, b.id).run();
  assert.ok(await consumeVerifyToken(raw), "token itself is valid");
  assert.equal(await verifiedAt(b.id), null, "but the new address stays unconfirmed");
});

test("expired and made-up tokens are refused", async () => {
  const b = await brand();
  const raw = await createVerifyToken("brand", b.id, b.email);
  await db.prepare("UPDATE email_verifications SET expires_at = now() - interval '1 minute' WHERE user_id=?").bind(b.id).run();
  assert.equal(await consumeVerifyToken(raw), null);
  assert.equal(await consumeVerifyToken("not-a-real-token-but-long-enough"), null);
  assert.equal(await consumeVerifyToken(""), null);
});

// Brand account linking (app/(net)/brand/_lib.js): earlier briefs join the account only once the
// email is confirmed, matched case-insensitively, and never taken from another account.
import { linkCampaignsByEmail } from "@/app/(net)/brand/_lib.js";

test("earlier briefs are linked only after the email is confirmed, and never stolen", async () => {
  const b = await brand();
  const other = await brand();
  const mk = (id, email, acct = null) => db.prepare("INSERT INTO campaigns (id, slug, title, brand, client_email, brand_account_id) VALUES (?,?,?,?,?,?)").bind(id, id, id, "IT", email, acct).run();
  const k1 = `it-k-${crypto.randomUUID()}`, k2 = `it-k-${crypto.randomUUID()}`;
  await mk(k1, b.email.toUpperCase());
  await mk(k2, b.email, other.id);
  assert.equal(await linkCampaignsByEmail(b.id), 0, "unconfirmed email links nothing");
  assert.ok(await consumeVerifyToken(await createVerifyToken("brand", b.id, b.email)));
  assert.equal(await linkCampaignsByEmail(b.id), 1);
  const owner = async (k) => (await db.prepare("SELECT brand_account_id FROM campaigns WHERE id=?").bind(k).first()).brand_account_id;
  assert.equal(await owner(k1), b.id);
  assert.equal(await owner(k2), other.id, "a campaign already on another account stays there");
  assert.equal(await linkCampaignsByEmail(b.id), 0, "running again changes nothing");
});

test("brand page queries run on Postgres", async () => {
  const b = await brand();
  await db.prepare("UPDATE brand_accounts SET last_login_at=now(), disabled_at=NULL WHERE id=?").bind(b.id).run();
  await db.prepare("SELECT id, title, brand, status, share_token, deadline, created_at FROM campaigns WHERE brand_account_id=? ORDER BY created_at DESC LIMIT 200").bind(b.id).all();
  await db.prepare("SELECT at, kind, campaign_id, amount_paise, utr FROM finance_ledger WHERE campaign_id IN (?,?) AND kind IN ('brand_payment_received','brand_refund_sent') ORDER BY at DESC LIMIT 50").bind("x", "y").all();
  const r = await db.prepare(`SELECT b.id, u.email AS verifier, (SELECT COUNT(*) FROM campaigns k WHERE k.brand_account_id=b.id) AS campaigns
     FROM brand_accounts b LEFT JOIN team_users u ON u.id=b.verified_by WHERE b.id=?`).bind(b.id).first();
  assert.equal(Number(r.campaigns), 0);
  const dup = await db.prepare("INSERT INTO brand_accounts (id, email, password_hash, salt) VALUES (?,?,'x','y') ON CONFLICT (email) DO NOTHING").bind(`dup-${b.id}`, b.email).run();
  assert.equal(Number(dup.meta?.changes || 0), 0, "second sign-up with the same email inserts nothing");
});
