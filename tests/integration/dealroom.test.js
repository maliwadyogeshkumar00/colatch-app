// Deal room against a real Postgres (DATABASE_URL): messages + read state + outbox, shipments, usage-rights expiry.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db, closeDb, ensureSchema } from "@/lib/net/db";
import { transition } from "@/lib/net/dealflow";
import { postMessage, listMessages, unreadCount, unreadForCampaign, messagesForCampaign, markRead, markCampaignRead, notifyMessage, MessageError } from "@/lib/net/messages";
import { addShipment, moveShipment, listShipments, shipmentStatusForCampaign, creatorAddress, ShipError } from "@/lib/net/shipments";
import { saveUsage, syncUsageStart, usageStatus, toDate, addMonths, UsageError } from "@/lib/net/usage";

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const finance = { kind: "team", id: "fin@test", role: "finance" };
const shortlister = { kind: "team", id: "sl@test", role: "shortlist" };

async function makeDeal() {
  await ensureSchema();
  const creatorId = id("cr"), campaignId = id("k"), dealId = id("d");
  await db.prepare("INSERT INTO creators (id, handle, name, email) VALUES (?,?,?,?)").bind(creatorId, creatorId, "Test Creator", `${creatorId}@creator.test`).run();
  await db.prepare("INSERT INTO campaigns (id, slug, title, client_email, share_token, usage_rights) VALUES (?,?,?,?,?,?)").bind(campaignId, campaignId, "Test campaign", `${campaignId}@brand.test`, id("tok") + "0123456789", "Paid ads on Meta for 3 months").run();
  await db.prepare("INSERT INTO creator_deals (id, creator_id, campaign_id, brand, fee, stage) VALUES (?,?,?,?,?,?)").bind(dealId, creatorId, campaignId, "Brand", 20000, "shortlisted").run();
  return { creatorId, campaignId, dealId, creator: { kind: "creator", id: creatorId }, brand: { kind: "brand", id: campaignId }, team: { kind: "team", id: "sl@test" } };
}

async function goLive(x) {
  await transition(x.dealId, "accept_terms", x.creator);
  await transition(x.dealId, "record_funding", finance, { amount: "23540", reference: "ROOMUTR" + x.dealId.slice(-6) });
  await transition(x.dealId, "submit_draft", x.creator, { draft_url: "https://drive.google.com/file/room" });
  await transition(x.dealId, "approve_draft", x.brand);
  await transition(x.dealId, "submit_live_link", x.creator, { post_url: "https://www.instagram.com/reel/room" });
  await transition(x.dealId, "verify_live", shortlister);
  return db.prepare("SELECT * FROM creator_deals WHERE id=?").bind(x.dealId).first();
}

after(async () => { await closeDb(); });

test("creator and brand messages are scrubbed on write; team messages are stored as written", async () => {
  const x = await makeDeal();
  const c = await postMessage(x.dealId, x.creator, "Sure! WhatsApp 98765 43210 or pay ravi@okaxis");
  const b = await postMessage(x.dealId, x.brand, "Email us at buyer@brand.com");
  const t = await postMessage(x.dealId, x.team, "Team here: call 9876543210 if stuck");
  assert.ok(c.created && b.created && t.created);
  const rows = await listMessages(x.dealId);
  assert.deepEqual(rows.map((r) => r.sender_kind), ["creator", "brand", "team"]);
  assert.equal(rows[0].scrubbed, true);
  assert.ok(!/98765|okaxis/.test(rows[0].body), rows[0].body);
  assert.equal(rows[1].scrubbed, true);
  assert.ok(!rows[1].body.includes("buyer@brand.com"));
  assert.equal(rows[2].scrubbed, false);
  assert.equal(rows[2].body, "Team here: call 9876543210 if stuck");
  assert.equal(rows[0].sender_id, x.creatorId);
  assert.equal(rows[1].sender_id, x.campaignId);
});

test("empty and over-long messages are refused and nothing is stored", async () => {
  const x = await makeDeal();
  await assert.rejects(postMessage(x.dealId, x.creator, "   "), MessageError);
  await assert.rejects(postMessage(x.dealId, x.brand, "y".repeat(2001)), MessageError);
  assert.equal((await listMessages(x.dealId)).length, 0);
});

test("submitting the same form twice stores one message", async () => {
  const x = await makeDeal();
  const mid = crypto.randomUUID();
  const results = await Promise.all([postMessage(x.dealId, x.creator, "Draft is coming Friday", mid), postMessage(x.dealId, x.creator, "Draft is coming Friday", mid)]);
  assert.equal(results.filter((r) => r.created).length, 1);
  const again = await postMessage(x.dealId, x.creator, "Draft is coming Friday", mid);
  assert.equal(again.created, false);
  assert.equal((await listMessages(x.dealId)).length, 1);
});

test("unread counts are per reader and clear when the deal is opened", async () => {
  const x = await makeDeal();
  await postMessage(x.dealId, x.creator, "Hi, quick question about the brief");
  await postMessage(x.dealId, x.team, "Answering shortly");
  // Own messages never count as unread.
  assert.equal(await unreadCount(x.dealId, x.creator), 1);
  assert.equal(await unreadCount(x.dealId, x.brand), 2);
  assert.equal(await unreadCount(x.dealId, x.team), 0, "replying marks the thread read for the one who replied");
  assert.equal(await unreadCount(x.dealId, { kind: "team", id: "other@test" }), 2, "another team member sees both");
  assert.deepEqual(await unreadForCampaign(x.campaignId, x.brand), { [x.dealId]: 2 });
  await markCampaignRead(x.campaignId, x.brand);
  assert.equal(await unreadCount(x.dealId, x.brand), 0);
  await new Promise((r) => setTimeout(r, 15));
  await postMessage(x.dealId, x.creator, "One more thing");
  assert.equal(await unreadCount(x.dealId, x.brand), 1);
  await markRead(x.dealId, x.brand);
  assert.equal(await unreadCount(x.dealId, x.brand), 0);
  const byDeal = await messagesForCampaign(x.campaignId);
  assert.equal(byDeal[x.dealId].length, 3);
  assert.equal(byDeal[x.dealId][2].body, "One more thing");
});

test("a new message queues one email for the other side, without the message text, and no repeat while unread", async () => {
  const x = await makeDeal();
  const m1 = await postMessage(x.dealId, x.creator, "Can I shoot on Saturday?");
  await notifyMessage(x.dealId, m1.id, x.creator);
  await notifyMessage(x.dealId, m1.id, x.creator); // retried action: deduped
  const rows = (await db.prepare("SELECT to_kind, to_address, template, payload, dedupe_key FROM notifications WHERE dedupe_key LIKE ? ORDER BY id").bind(`deal_message:${m1.id}:%`).all()).results;
  const brandMail = rows.filter((r) => r.to_kind === "brand");
  assert.equal(brandMail.length, 1);
  assert.equal(brandMail[0].to_address, `${x.campaignId}@brand.test`);
  assert.equal(brandMail[0].template, "account_alert");
  const payload = typeof brandMail[0].payload === "string" ? JSON.parse(brandMail[0].payload) : brandMail[0].payload;
  assert.ok(!String(payload.text).includes("Saturday"), "message text stays on Colatch");
  assert.equal(rows.filter((r) => r.to_kind === "creator").length, 0, "the sender is not emailed");
  // Second message while the brand still hasn't read the first: no second email to the brand.
  const m2 = await postMessage(x.dealId, x.creator, "Also, which colour?");
  await notifyMessage(x.dealId, m2.id, x.creator);
  const second = await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key=?").bind(`deal_message:${m2.id}:brand`).first();
  assert.equal(Number(second.n), 0);
  // The team replies: the creator is emailed (they have nothing unread).
  const t = await postMessage(x.dealId, x.team, "Saturday works");
  await notifyMessage(x.dealId, t.id, x.team);
  const toCreator = await db.prepare("SELECT to_address FROM notifications WHERE dedupe_key=?").bind(`deal_message:${t.id}:creator`).first();
  assert.equal(toCreator?.to_address, `${x.creatorId}@creator.test`);
});

test("shipments: pending → shipped → delivered → returned with timestamps; bad moves are refused", async () => {
  const x = await makeDeal();
  const s = await addShipment(x.dealId, { product: "Diwali hamper" }, "sl@test");
  assert.equal(s.status, "pending");
  assert.equal(s.shipped_at, null);
  await assert.rejects(moveShipment(x.dealId, s.id, "delivered"), ShipError);
  await assert.rejects(moveShipment(x.dealId, s.id, "shipped"), ShipError, "needs courier and AWB");
  const shipped = await moveShipment(x.dealId, s.id, "shipped", { carrier: "Delhivery", awb: "DL123456789" });
  assert.equal(shipped.status, "shipped");
  assert.ok(shipped.shipped_at);
  assert.equal(shipped.awb, "DL123456789");
  await assert.rejects(moveShipment(x.dealId, s.id, "shipped"), ShipError, "a stale tab can't ship twice");
  const delivered = await moveShipment(x.dealId, s.id, "delivered");
  assert.ok(delivered.delivered_at);
  assert.equal(toDate(delivered.shipped_at).getTime(), toDate(shipped.shipped_at).getTime(), "shipped time is kept");
  await assert.rejects(moveShipment(x.dealId, s.id, "shipped"), ShipError);
  assert.equal((await moveShipment(x.dealId, s.id, "returned")).status, "returned");
  // Another deal's shipment can't be moved through this deal.
  const other = await makeDeal();
  const o = await addShipment(other.dealId, { product: "Kurta", carrier: "Blue Dart", awb: "BD99887766", status: "shipped" }, "sl@test");
  assert.equal(o.status, "shipped");
  assert.ok(o.shipped_at);
  await assert.rejects(moveShipment(x.dealId, o.id, "delivered"), ShipError);
  assert.equal((await listShipments(x.dealId)).length, 1);
  // The brand's view has no courier, AWB or address.
  const brandView = await shipmentStatusForCampaign(other.campaignId);
  assert.deepEqual(Object.keys(brandView[other.dealId][0]).sort(), ["deal_id", "delivered_at", "id", "product", "shipped_at", "status"]);
});

test("the creator's address is read back for the team; missing is null", async () => {
  const x = await makeDeal();
  assert.equal(await creatorAddress(x.creatorId), null);
  await db.prepare("INSERT INTO creator_addresses (creator_id, name, line1, city, pincode) VALUES (?,?,?,?,?)").bind(x.creatorId, "Test Creator", "12 MG Road", "Pune", "411001").run();
  const a = await creatorAddress(x.creatorId);
  assert.equal(a.city, "Pune");
});

test("usage rights: saved before go-live start on the live date; expiry = start + months; expired shows as expired", async () => {
  const x = await makeDeal();
  await assert.rejects(saveUsage(x.dealId, { channels: "", months: 3 }), UsageError);
  await assert.rejects(saveUsage(x.dealId, { channels: "Website", months: 0 }), UsageError);
  const before = await saveUsage(x.dealId, { channels: "Paid ads (Meta), Organic repost", months: "3" });
  assert.equal(before.usage_starts_at, null);
  assert.equal(before.usage_expires_at, null);
  assert.equal(usageStatus(before).state, "pending");

  const live = await goLive(x);
  assert.ok(live.live_at);
  assert.equal(await syncUsageStart(live), true);
  assert.equal(await syncUsageStart(live), false, "only once");
  const d = await db.prepare("SELECT * FROM creator_deals WHERE id=?").bind(x.dealId).first();
  assert.equal(toDate(d.usage_starts_at).getTime(), toDate(d.live_at).getTime());
  assert.equal(toDate(d.usage_expires_at).getTime(), addMonths(toDate(d.live_at), 3).getTime());
  const now = usageStatus(d);
  assert.equal(now.state, "active");
  assert.match(now.line, /^Usage rights: Paid ads on Meta and Organic repost until .+ \(\d+ days left\)$/);

  // An explicit start date in the past: rights already ran out.
  const old = await saveUsage(x.dealId, { channels: "Website", months: "1", starts: "2025-01-10" });
  assert.equal(toDate(old.usage_expires_at).toISOString(), "2025-02-09T18:30:00.000Z");
  const st = usageStatus(old);
  assert.equal(st.state, "expired");
  assert.match(st.line, /expired on 10 Feb 2025/);
});
