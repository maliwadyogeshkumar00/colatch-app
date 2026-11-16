// Disputes against a real Postgres (DATABASE_URL): one open dispute per side, owner checks, audited resolution.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { raiseDispute, resolveDispute, DisputeError } from "@/lib/net/disputes";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const admin = { email: "admin@test", role: "admin" };
const viewer = { email: "view@test", role: "viewer" };

async function makeDeal() {
  await ensureSchema();
  const creatorId = id("cr"), campaignId = id("k"), dealId = id("d");
  await db.prepare("INSERT INTO creators (id, handle, name) VALUES (?,?,?)").bind(creatorId, creatorId, "Test Creator").run();
  await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token) VALUES (?,?,?,?,?)").bind(campaignId, campaignId, "Test campaign", `${campaignId}@brand.test`, id("tok")).run();
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, brand, fee, stage) VALUES (?,?,?,?,?,?)").bind(dealId, creatorId, campaignId, "Brand", 20000, "shortlisted").run();
  return { creatorId, campaignId, dealId };
}

async function rejects(p, code) {
  await assert.rejects(p, (e) => { assert.ok(e instanceof DisputeError, `expected DisputeError, got ${e?.message}`); assert.equal(e.code, code, e.message); return true; });
}

after(async () => { await closeDb(); });

test("each side can have one open dispute per deal; a second is refused", async () => {
  const x = await makeDeal();
  const first = await raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "late", "The brand hasn't replied to the draft for a week.", db);
  assert.ok(first);
  await rejects(raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "payment", "Raising a second one at the same time.", db), "duplicate");
  // The brand side is independent.
  const brand = await raiseDispute(x.dealId, { kind: "brand", id: x.campaignId }, "quality", "The draft doesn't follow the brief at all.", db);
  assert.ok(brand);
  const n = await db.prepare("SELECT COUNT(*) AS n FROM disputes WHERE deal_id=? AND status='open'").bind(x.dealId).first();
  assert.equal(Number(n.n), 2);
});

test("only people on the deal can raise one, and the text is checked", async () => {
  const x = await makeDeal();
  const other = await makeDeal();
  await rejects(raiseDispute(x.dealId, { kind: "creator", id: other.creatorId }, "late", "Not my deal but trying anyway.", db), "forbidden");
  await rejects(raiseDispute(x.dealId, { kind: "brand", id: other.campaignId }, "late", "Not my campaign but trying anyway.", db), "forbidden");
  await rejects(raiseDispute(x.dealId, { kind: "team", id: "view@test", role: "viewer" }, "late", "Viewers can only read.", db), "forbidden");
  await rejects(raiseDispute("missing-deal", { kind: "creator", id: x.creatorId }, "late", "This deal does not exist.", db), "not_found");
  await rejects(raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "nonsense", "Unknown reason code here.", db), "invalid_input");
  await rejects(raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "late", "short", db), "invalid_input");
});

test("resolving is permission-checked, audited, happens once, and allows a new dispute after", async () => {
  const x = await makeDeal();
  const did = await raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "payment", "Payment is two weeks past the due date.", db);
  await rejects(resolveDispute(did, viewer, "resolved", "Viewers should not be able to do this.", db), "forbidden");
  await rejects(resolveDispute(did, admin, "resolved", "short", db), "invalid_input");
  await rejects(resolveDispute(did, admin, "maybe", "Not a valid outcome value here.", db), "invalid_input");
  const r = await resolveDispute(did, admin, "resolved", "Finance confirmed the payout; UTR shared in the deal room.", db);
  assert.equal(r.id, did);
  const row = await db.prepare("SELECT status, resolved_by, resolution FROM disputes WHERE id=?").bind(did).first();
  assert.equal(row.status, "resolved");
  assert.equal(row.resolved_by, "admin@test");
  const audits = await db.prepare("SELECT action FROM audit_log WHERE entity_id=? AND action LIKE 'dispute.%' ORDER BY id").bind(x.dealId).all();
  assert.deepEqual(audits.results.map((a) => a.action), ["dispute.raised", "dispute.resolved"]);
  await rejects(resolveDispute(did, admin, "rejected", "Trying to close it a second time.", db), "invalid_state");
  // Closed disputes don't block a new one.
  assert.ok(await raiseDispute(x.dealId, { kind: "creator", id: x.creatorId }, "other", "A new problem came up after the first one.", db));
});

test("contact details are scrubbed from the dispute text", async () => {
  const x = await makeDeal();
  const did = await raiseDispute(x.dealId, { kind: "brand", id: x.campaignId }, "conduct", "Creator asked us to WhatsApp them on 9876543210 instead.", db);
  const row = await db.prepare("SELECT detail FROM disputes WHERE id=?").bind(did).first();
  assert.ok(!row.detail.includes("9876543210"), row.detail);
});
